const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const port = Number(process.argv[2]);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Supply an isolated PostgreSQL port.');

Object.assign(process.env, {
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: String(port),
  DB_USER: 'swi_c08',
  DB_PASSWORD: '',
  DB_NAME: 'swi_c08_f1',
  DB_SSL: 'false',
  DOTENV_CONFIG_QUIET: 'true',
});

const fromProject = createRequire(path.resolve('package.json'));
const { app } = fromProject('./src/app.ts');
const { pool } = fromProject('./src/db.ts');
const { initializeDatabase } = fromProject('./src/service.ts');

const iso = (ms) => new Date(ms).toISOString();

async function persisted(id) {
  const { rows: [row] } = await pool.query(`
    SELECT r.status, count(o.id)::int AS outbox_count
    FROM reservations r LEFT JOIN notifications_outbox o ON o.reservation_id = r.id
    WHERE r.id = $1 GROUP BY r.id`, [id]);
  return row;
}

async function observeWait(blockerPid, cutoff) {
  const stopAt = Math.min(cutoff, Date.now() + 5000);
  while (Date.now() < stopAt) {
    const { rows } = await pool.query(`
      SELECT pid, wait_event, query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND $1::integer = ANY(pg_blocking_pids(pid))`, [blockerPid]);
    const row = rows.find(({ query }) => /FROM reservations\b[\s\S]*FOR UPDATE/i.test(query));
    if (row) {
      const observedAt = Date.now();
      assert(observedAt < cutoff, 'Observed the application waiting too late for this probe.');
      return { at: iso(observedAt), waiterPid: row.pid, blockerPid, event: row.wait_event };
    }
    await delay(25);
  }
  throw new Error('PostgreSQL did not show Confirm waiting on the test transaction before the deadline.');
}

async function scenario(base, late) {
  const caseId = late ? 'TC-C08-02' : 'TC-C08-01';
  const userId = late ? 'c08-student-late' : 'c08-student-early';
  const hamsterId = late ? 'c08-ferda-late' : 'c08-ferda-early';
  const cutoff = Date.now() + (late ? 8000 : 20000);
  const start = iso(cutoff + 15 * 60 * 1000);
  const end = iso(Date.parse(start) + 10 * 60 * 1000);
  await pool.query('INSERT INTO hamsters (id, name, is_active, requires_approval) VALUES ($1, $2, true, false)', [hamsterId, hamsterId]);
  const { rows: [{ id }] } = await pool.query(`
    INSERT INTO reservations (user_id, hamster_id, start_time, end_time, status)
    VALUES ($1, $2, $3, $4, 'DRAFT') RETURNING id`, [userId, hamsterId, start, end]);
  const before = await persisted(id);
  assert.deepEqual(before, { status: 'DRAFT', outbox_count: 0 });

  const holder = await pool.connect();
  let request;
  let wait;
  let requestedAt;
  let releaseStarted;
  let releaseFinished;
  try {
    await holder.query('BEGIN');
    const { rows: [{ pid }] } = await holder.query('SELECT pg_backend_pid() AS pid');
    await holder.query('SELECT id FROM reservations WHERE id = $1 FOR UPDATE', [id]);
    requestedAt = iso(Date.now());
    request = fetch(`${base}/api/reservations/${id}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
      signal: AbortSignal.timeout(25000),
    }).then(async (result) => ({ status: result.status, body: await result.json() }));
    // The request can fail while the test still holds the lock. Always observe its final result below.
    request.catch(() => {});
    wait = await observeWait(pid, cutoff);
    if (late) {
      while (Date.now() <= cutoff + 100) {
        await delay(cutoff + 101 - Date.now());
      }
    }
    releaseStarted = iso(Date.now());
    await holder.query('COMMIT');
    releaseFinished = iso(Date.now());
  } finally {
    try {
      if (!releaseFinished) await holder.query('ROLLBACK');
    } finally {
      holder.release();
    }
  }

  const response = await request;
  assert(late ? Date.parse(releaseStarted) > cutoff : Date.parse(releaseFinished) < cutoff,
    'The probe released the lock on the wrong side of the deadline.');
  const after = await persisted(id);
  const lateError = 'Rezervaci lze potvrdit nejpozději 15 minut před jejím začátkem.';
  const pass = late
    ? response.status === 400 && response.body.error === lateError && after.status === 'DRAFT' && after.outbox_count === 0
    : response.status === 200 && response.body.status === 'CONFIRMED' && after.status === 'CONFIRMED' && after.outbox_count === 1;
  return {
    caseId, verdict: pass ? 'PASS' : 'FAIL', id, userId, hamsterId, start, end, cutoff: iso(cutoff),
    before, requestedAt, wait, releaseStarted, releaseFinished, response, after,
  };
}

async function main() {
  let server;
  try {
    const { rows: [database] } = await pool.query(`
      SELECT current_database() AS name, current_user AS role,
             current_setting('server_version') AS version,
             to_regclass('public.reservations') AS existing_reservations`);
    assert.equal(database.name, 'swi_c08_f1');
    assert.equal(database.role, 'swi_c08');
    assert.equal(database.existing_reservations, null, 'Start with a fresh, isolated database.');
    await initializeDatabase();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    console.log(JSON.stringify({ runtime: process.version, database, port, http: base }));
    for (const late of [false, true]) {
      const result = await scenario(base, late);
      console.log(JSON.stringify(result));
      if (result.verdict === 'FAIL') process.exitCode = 1;
    }
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
}

main().catch(err => {
  console.error('BLOCKED:', err.message);
  process.exitCode = 2;
});
