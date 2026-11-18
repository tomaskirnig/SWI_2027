import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { app } from './app';
import { pool } from './db';
import { initializeDatabase } from './service';

const minute = 60_000;
const start = Date.parse('2032-01-05T12:00:00Z');
type State = 'DRAFT' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED';
type Operation = 'confirm' | 'cancel' | 'decide';
type Decision = 'APPROVE' | 'REJECT';
let sequence = 0;

async function fixture(status: State, startsAt = start, approval = status === 'PENDING_APPROVAL') {
  const user = `c09-student-${++sequence}`;
  const hamster = `c09-hamster-${sequence}`;
  await pool.query('INSERT INTO hamsters (id, name, is_active, requires_approval) VALUES ($1, $1, true, $2)', [hamster, approval]);
  const { rows: [row] } = await pool.query<{ id: number }>(`
    INSERT INTO reservations (user_id, hamster_id, start_time, end_time, status)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`, [user, hamster, new Date(startsAt), new Date(startsAt + 10 * minute), status]);
  if (status !== 'DRAFT') {
    await pool.query(`INSERT INTO notifications_outbox (reservation_id, recipient, message)
      SELECT $1, recipient, 'Výchozí oznámení' FROM unnest($2::text[]) AS recipient`,
    [row.id, status === 'PENDING_APPROVAL' ? [user, `spravce:${hamster}`] : [user]]);
  }
  return { id: row.id, user, hamster };
}

type Reservation = Awaited<ReturnType<typeof fixture>>;

async function stored(id: number) {
  const { rows: [row] } = await pool.query<{ status: State }>('SELECT status FROM reservations WHERE id = $1', [id]);
  const { rows: outbox } = await pool.query<{ id: number; recipient: string; message: string; status: string }>(
    'SELECT id, recipient, message, status FROM notifications_outbox WHERE reservation_id = $1 ORDER BY id', [id]);
  return { status: row.status, outbox };
}

type Stored = Awaited<ReturnType<typeof stored>>;

function request(base: string, target: Reservation, operation: Operation, time?: number, decision?: Decision) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (time !== undefined) headers['x-current-time'] = new Date(time).toISOString();
  if (operation === 'decide') headers['x-user-role'] = 'manager';
  return fetch(`${base}/api/reservations/${target.id}/${operation}`, {
    method: 'POST', headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify(operation === 'decide' ? { decision } : { user_id: target.user }),
  }).then(async response => ({ status: response.status, body: await response.json() as { status?: State; error?: string; idempotent?: boolean } }));
}

type Reply = Awaited<ReturnType<typeof request>>;

async function expectTransition(target: Reservation, reply: Reply, before: Stored, status: State, recipients: string[]) {
  assert.equal(reply.status, 200);
  assert.equal(reply.body.status, status);
  const after = await stored(target.id);
  assert.equal(after.status, status);
  assert.deepEqual(after.outbox.slice(0, before.outbox.length), before.outbox);
  assert.deepEqual(after.outbox.slice(before.outbox.length).map(row => row.recipient), recipients);
}

async function expectLate(target: Reservation, reply: Reply, before: Stored, reason: RegExp) {
  assert.equal(reply.status, 400);
  assert.match(reply.body.error ?? '', reason);
  assert.deepEqual(await stored(target.id), before);
}

async function waitForLock(blocker: number, table: 'reservations' | 'hamsters', cutoff: number) {
  while (Date.now() < cutoff) {
    const { rows } = await pool.query<{ query: string }>(`
      SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND $1::integer = ANY(pg_blocking_pids(pid))`, [blocker]);
    if (Date.now() < cutoff && rows.some(row => row.query.includes(`FROM ${table} WHERE`) && row.query.includes('FOR UPDATE'))) return;
    await delay(20);
  }
  assert.fail(`Očekávané čekání na ${table} se před lhůtou neprokázalo.`);
}

async function lateWhileLocked(base: string, operation: 'decide' | 'cancel', decision?: Decision) {
  const cutoff = Date.now() + 5_000;
  const target = await fixture('PENDING_APPROVAL', cutoff + (operation === 'decide' ? 60 : 15) * minute);
  const before = await stored(target.id);
  const lock = operation === 'decide'
    ? { table: 'hamsters' as const, id: target.hamster }
    : { table: 'reservations' as const, id: target.id };
  const holder = await pool.connect();
  let pending: Promise<Reply> | undefined;
  try {
    await holder.query('BEGIN');
    const { rows: [{ pid }] } = await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await holder.query(`SELECT id FROM ${lock.table} WHERE id=$1 FOR UPDATE`, [lock.id]);
    pending = request(base, target, operation, undefined, decision);
    void pending.catch(() => {});
    await waitForLock(pid, lock.table, cutoff);
    while (Date.now() <= cutoff) await delay(cutoff - Date.now() + 20);
    await holder.query('COMMIT');
  } catch (error) {
    await holder.query('ROLLBACK');
    throw error;
  } finally {
    holder.release();
    await pending?.catch(() => {});
  }
  assert(pending);
  const reason = operation === 'decide' ? /Lhůta.*vypršela/ : /nejpozději 15 minut/;
  await expectLate(target, await pending, before, reason);
  console.log(`[PASS] C09 skutečný zámek ${lock.table}: ${decision ?? operation}, HTTP 400, původní stav a outbox`);
}

async function main() {
  await initializeDatabase();
  // Pouze HTTP aplikace, aby OP-06 souběžně neměnila výchozí stav.
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    const confirm = await fixture('DRAFT');
    const confirmLate = await fixture('DRAFT');
    const approval = await fixture('DRAFT', start, true);
    const confirmBefore = await stored(confirm.id);
    const lateBefore = await stored(confirmLate.id);
    const approvalBefore = await stored(approval.id);
    await expectTransition(confirm, await request(base, confirm, 'confirm', start - 15 * minute), confirmBefore, 'CONFIRMED', [confirm.user]);
    await expectLate(confirmLate, await request(base, confirmLate, 'confirm', start - 15 * minute + 1), lateBefore, /nejpozději 15 minut/);
    await expectTransition(approval, await request(base, approval, 'confirm', start - 15 * minute), approvalBefore, 'PENDING_APPROVAL', [approval.user, `spravce:${approval.hamster}`]);
    console.log('[PASS] C09 Confirm: přesná hranice, +1 ms, schvalovací větev a adresáti outboxu');

    for (const decision of ['APPROVE', 'REJECT'] as const) {
      const allowed = await fixture('PENDING_APPROVAL');
      const allowedBefore = await stored(allowed.id);
      await expectTransition(allowed, await request(base, allowed, 'decide', start - 60 * minute - 1, decision), allowedBefore,
        decision === 'APPROVE' ? 'CONFIRMED' : 'REJECTED', [allowed.user]);
      for (const offset of [0, 1]) {
        const late = await fixture('PENDING_APPROVAL');
        const before = await stored(late.id);
        await expectLate(late, await request(base, late, 'decide', start - 60 * minute + offset, decision), before, /Lhůta.*vypršela/);
      }
      console.log(`[PASS] C09 ${decision}: -1 ms, přesná hranice a +1 ms`);
      await lateWhileLocked(base, 'decide', decision);
    }

    for (const status of ['DRAFT', 'CONFIRMED', 'PENDING_APPROVAL'] as const) {
      const allowed = await fixture(status);
      const before = await stored(allowed.id);
      await expectTransition(allowed, await request(base, allowed, 'cancel', start - 15 * minute), before, 'CANCELLED', [allowed.user]);
      const late = await fixture(status);
      const lateBefore = await stored(late.id);
      await expectLate(late, await request(base, late, 'cancel', start - 15 * minute + 1), lateBefore, /nejpozději 15 minut/);
    }
    const cancelled = await fixture('CANCELLED');
    const cancelledBefore = await stored(cancelled.id);
    const repeated = await request(base, cancelled, 'cancel', start);
    await expectTransition(cancelled, repeated, cancelledBefore, 'CANCELLED', []);
    assert.equal(repeated.body.idempotent, true);
    console.log('[PASS] C09 Cancel: přesná hranice, +1 ms a idempotentní storno po lhůtě');
    await lateWhileLocked(base, 'cancel');
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
