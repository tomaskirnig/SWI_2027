import assert from 'node:assert/strict';
import { app } from './app';
import { pool } from './db';
import { confirmationPolicy } from './domain';
import { repository } from './repository';
import { setNotificationSender, resetNotificationSender } from './notification';
import { initializeDatabase, createReservation, confirmReservation, cancelReservation, decideReservation, expirePendingReservations } from './service';

const NOW = new Date('2030-06-10T08:00:00+02:00');
const d = (time: string) => new Date(`2030-06-10T${time}+02:00`);
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release: () => release() };
}
async function reset() {
  await pool.query('TRUNCATE notifications_outbox, reservations RESTART IDENTITY');
  await initializeDatabase();
  resetNotificationSender();
}
async function state(id: number) {
  return (await pool.query('SELECT status FROM reservations WHERE id=$1', [id])).rows[0].status;
}
async function notifications(id: number) {
  return (await pool.query('SELECT * FROM notifications_outbox WHERE reservation_id=$1 ORDER BY id', [id])).rows;
}
async function pending() {
  return (await pool.query("INSERT INTO reservations (user_id,hamster_id,start_time,end_time,status) VALUES ('student-a','archimedes',$1,$2,'PENDING_APPROVAL') RETURNING id", [d('12:00:00'), d('12:20:00')])).rows[0].id as number;
}

// Čekáme na skutečné čekání v PostgreSQL, nikoli na odhad rychlosti requestu.
async function blockedOrFinished(finished: () => boolean) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (finished()) return;
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if (result.rows[0].count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Souběžná operace nezačala čekat na zámek ani nedoběhla.');
}

const tests: Array<[string, () => Promise<void>]> = [
  ['R-01 HTTP walking skeleton používá policy a odmítnutí nezmění data', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const original = confirmationPolicy.evaluate;
    async function http(method: string, url: string, body?: unknown) {
      const response = await fetch(base + url, {
        method, headers: { 'content-type': 'application/json', 'x-current-time': NOW.toISOString() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() as any };
    }
    try {
      const input = { user_id: 'student-a', hamster_id: 'ferda', start_time: d('12:00:00').toISOString(), end_time: d('12:20:00').toISOString() };
      const created = await http('POST', '/api/reservations', input);
      assert.equal(created.status, 201);
      const id = created.body.id;
      const read = await http('GET', `/api/reservations/${id}`);
      assert.equal(read.status, 200);
      assert.equal(read.body.status, 'DRAFT');
      for (const [key, value] of Object.entries(input)) assert.equal(read.body[key], value);
      confirmationPolicy.evaluate = () => ({ ok: false, code: 'SLOT_CONFLICT', message: 'Kontrolní odmítnutí policy.' });
      const rejected = await http('POST', `/api/reservations/${id}/confirm`, { user_id: 'student-a' });
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.error, 'Kontrolní odmítnutí policy.');
      assert.equal(await state(id), 'DRAFT');
      assert.equal((await notifications(id)).length, 0);
      confirmationPolicy.evaluate = original;
      assert.equal((await http('POST', `/api/reservations/${id}/confirm`, { user_id: 'student-a' })).body.status, 'CONFIRMED');
      assert.equal((await http('POST', `/api/reservations/${id}/cancel`, { user_id: 'student-a' })).body.status, 'CANCELLED');
      const query = new URLSearchParams({ hamster_id: 'ferda', start_time: input.start_time, end_time: input.end_time });
      assert.equal((await http('GET', '/api/reservations/availability?' + query)).body.available, true);
    } finally {
      confirmationPolicy.evaluate = original;
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }],
  ['R-02 Approve/Reject uloží právě jeden požadavek studentovi do outboxu', async () => {
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      await reset();
      let calls = 0;
      setNotificationSender(async () => { calls++; });
      const draft = await createReservation('student-a', 'archimedes', d('12:00:00'), d('12:20:00'), NOW);
      await confirmReservation(draft.id, 'student-a', NOW);
      const before = await notifications(draft.id);
      const callsBefore = calls;
      await decideReservation(draft.id, 'manager', decision, d('10:00:00'));
      const after = await notifications(draft.id);
      assert.equal(after.length, before.length + 1);
      assert.equal(after.at(-1).recipient, 'student-a');
      assert.equal(after.at(-1).status, 'PENDING');
      assert.equal(calls, callsBefore, 'Prototyp při Decide eviduje požadavek, neslibuje doručení.');
    }
  }],
  ['R-03 Expire × Cancel: po získání zámku expirací storno nepřepíše EXPIRED', async () => {
    const id = await pending();
    const selected = gate(), resume = gate();
    const original = repository.findPendingReservationsBeforeTimeForUpdate;
    repository.findPendingReservationsBeforeTimeForUpdate = async (client, cutoff) => {
      const rows = await original.call(repository, client, cutoff);
      selected.release();
      await resume.promise;
      return rows;
    };
    const expiry = expirePendingReservations(d('11:00:00'));
    let cancellation: Promise<unknown> | undefined;
    try {
      await selected.promise;
      let finished = false;
      cancellation = cancelReservation(id, 'student-a', d('11:00:00')).then(
        value => { finished = true; return { value }; },
        error => { finished = true; return { error }; },
      );
      await blockedOrFinished(() => finished);
      resume.release();
      const [expired, cancelled] = await Promise.all([expiry, cancellation]) as [any, any];
      assert.equal(expired.expiredCount, 1);
      assert.equal(cancelled.error?.status, 400);
      assert.equal(await state(id), 'EXPIRED');
      assert.equal((await notifications(id)).length, 2);
    } finally {
      resume.release();
      await Promise.allSettled([expiry, cancellation]);
      repository.findPendingReservationsBeforeTimeForUpdate = original;
    }
  }],
  ['R-04 Cancel × Expire: úspěšně zrušená žádost zůstane CANCELLED', async () => {
    const id = await pending();
    const locked = gate(), resume = gate();
    const original = repository.findReservationByIdForUpdate;
    repository.findReservationByIdForUpdate = async (client, reservationId) => {
      const row = await original.call(repository, client, reservationId);
      locked.release();
      await resume.promise;
      return row;
    };
    const cancellation = cancelReservation(id, 'student-a', d('11:00:00'));
    let expiry: Promise<any> | undefined;
    try {
      await locked.promise;
      let finished = false;
      expiry = expirePendingReservations(d('11:00:00')).finally(() => { finished = true; });
      await blockedOrFinished(() => finished);
      resume.release();
      const [cancelled, expired] = await Promise.all([cancellation, expiry]);
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(expired.expiredCount, 0);
      assert.equal(await state(id), 'CANCELLED');
      assert.equal((await notifications(id)).length, 1);
    } finally {
      resume.release();
      await Promise.allSettled([cancellation, expiry]);
      repository.findReservationByIdForUpdate = original;
    }
  }],
  ['R-05 Expire × Expire: jediný přechod a dvě oznámení bez duplicit', async () => {
    const id = await pending();
    const selected = gate(), resume = gate();
    const original = repository.findPendingReservationsBeforeTimeForUpdate;
    let firstRead = true;
    repository.findPendingReservationsBeforeTimeForUpdate = async (client, cutoff) => {
      const rows = await original.call(repository, client, cutoff);
      if (firstRead) {
        firstRead = false;
        selected.release();
        await resume.promise;
      }
      return rows;
    };
    const first = expirePendingReservations(d('11:00:00'));
    let second: Promise<any> | undefined;
    try {
      await selected.promise;
      let finished = false;
      second = expirePendingReservations(d('11:00:00')).finally(() => { finished = true; });
      await blockedOrFinished(() => finished);
      resume.release();
      const results = await Promise.all([first, second]);
      assert.equal(results.reduce((sum, item) => sum + item.expiredCount, 0), 1);
      assert.equal((await notifications(id)).length, 2);
    } finally {
      resume.release();
      await Promise.allSettled([first, second]);
      repository.findPendingReservationsBeforeTimeForUpdate = original;
    }
  }],
  ['R-06 Chyba zápisu outboxu vrátí celou expiraci zpět', async () => {
    const id = await pending();
    const original = repository.insertOutboxNotification;
    let calls = 0;
    repository.insertOutboxNotification = async (...args) => {
      if (++calls === 2) throw new Error('Kontrolní chyba outboxu.');
      return original.apply(repository, args);
    };
    try {
      await assert.rejects(expirePendingReservations(d('11:00:00')), /Kontrolní chyba outboxu/);
      assert.equal(await state(id), 'PENDING_APPROVAL');
      assert.equal((await notifications(id)).length, 0);
    } finally { repository.insertOutboxNotification = original; }
    assert.equal((await expirePendingReservations(d('11:00:00'))).expiredCount, 1);
  }],
  ['R-07 Souběžná nekolidující potvrzení nepřekročí denní limit', async () => {
    const a = await createReservation('student-a', 'ferda', d('12:00:00'), d('12:20:00'), NOW);
    const b = await createReservation('student-a', 'ferda', d('13:00:00'), d('13:20:00'), NOW);
    const results = await Promise.allSettled([confirmReservation(a.id, 'student-a', NOW), confirmReservation(b.id, 'student-a', NOW)]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM reservations WHERE status='CONFIRMED'")).rows[0].count, 1);
  }],
];

async function main() {
  await initializeDatabase();
  let passed = 0;
  try {
    for (const [name, run] of tests) {
      await reset();
      await run();
      passed++;
      console.log(`[PASS] ${name}`);
    }
    console.log(`REGRESSION PASS: ${passed}; FAIL: 0`);
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
