import { PoolClient } from 'pg';
import { pool } from './db';
import {
  ReservationStatus,
  isIntervalValid,
  isAtLeast15MinBefore,
  doIntervalsOverlap,
  calculateMinutesPerDay,
  blocksHamsterAvailability,
  countsTowardDailyLimit,
  MAX_DAILY_MINUTES,
  ONE_HOUR_MS,
} from './domain';

export interface ReservationRow {
  id: number;
  user_id: string;
  hamster_id: string;
  start_time: Date;
  end_time: Date;
  status: ReservationStatus;
  created_at: Date;
}

export interface HamsterRow {
  id: string;
  name: string;
  is_active: boolean;
  requires_approval: boolean;
}

/**
 * Inicializace databázového schématu a výchozích dat
 */
export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hamsters (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      requires_approval BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      hamster_id VARCHAR(50) NOT NULL REFERENCES hamsters(id),
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status VARCHAR(30) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications_outbox (
      id SERIAL PRIMARY KEY,
      reservation_id INT NOT NULL,
      recipient VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Výchozí křečci:
  // 1. "ferda" - běžný aktivní křeček (nevyžaduje schválení, přímé potvrzení)
  // 2. "archimedes" - speciální křeček vyžadující schválení správcem (v0.2)
  // 3. "spavek" - neaktivní křeček (pro negativní testy)
  await pool.query(`
    INSERT INTO hamsters (id, name, is_active, requires_approval)
    VALUES 
      ('ferda', 'Školní křeček Ferda', true, false),
      ('archimedes', 'Speciální křeček Archimedes', true, true),
      ('spavek', 'Spící křeček Spávek', false, false)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      is_active = EXCLUDED.is_active,
      requires_approval = EXCLUDED.requires_approval;
  `);
}

/**
 * Pomocná funkce pro ověření denního limitu studenta pro konkrétního křečka
 */
async function checkDailyLimitExceeded(
  client: PoolClient | typeof pool,
  userId: string,
  hamsterId: string,
  newStart: Date,
  newEnd: Date,
  excludeReservationId?: number
): Promise<{ exceeded: boolean; day?: string; currentMinutes?: number; requestedMinutes?: number }> {
  // Spočteme minuty nového požadavku rozpadlé po dnech
  const requestedMinutesMap = calculateMinutesPerDay(newStart, newEnd);

  // Načteme existující rezervace ve stavech čerpajících limit (CONFIRMED, PENDING_APPROVAL)
  let query = `
    SELECT id, start_time, end_time, status 
    FROM reservations 
    WHERE user_id = $1 AND hamster_id = $2 
      AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
  `;
  const params: any[] = [userId, hamsterId];

  if (excludeReservationId) {
    query += ' AND id != $3';
    params.push(excludeReservationId);
  }

  const res = await client.query(query, params);

  // Spočítáme existující minuty po dnech
  const existingMinutesMap = new Map<string, number>();
  for (const row of res.rows) {
    const rowStart = new Date(row.start_time);
    const rowEnd = new Date(row.end_time);
    const rowMap = calculateMinutesPerDay(rowStart, rowEnd);

    for (const [day, mins] of rowMap.entries()) {
      existingMinutesMap.set(day, (existingMinutesMap.get(day) || 0) + mins);
    }
  }

  // Zkontrolujeme každý den nového požadavku
  for (const [day, requestedMins] of requestedMinutesMap.entries()) {
    const existingMins = existingMinutesMap.get(day) || 0;
    if (existingMins + requestedMins > MAX_DAILY_MINUTES) {
      return {
        exceeded: true,
        day,
        currentMinutes: existingMins,
        requestedMinutes: requestedMins,
      };
    }
  }

  return { exceeded: false };
}

/**
 * Pomocná funkce pro ověření kolize překryvu (BR-02)
 */
async function findConflictingReservation(
  client: PoolClient | typeof pool,
  hamsterId: string,
  start: Date,
  end: Date,
  excludeReservationId?: number
): Promise<ReservationRow | null> {
  let query = `
    SELECT * FROM reservations 
    WHERE hamster_id = $1 
      AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
  `;
  const params: any[] = [hamsterId];

  if (excludeReservationId) {
    query += ' AND id != $2';
    params.push(excludeReservationId);
  }

  const res = await client.query(query, params);

  for (const row of res.rows) {
    const rowStart = new Date(row.start_time);
    const rowEnd = new Date(row.end_time);
    if (doIntervalsOverlap(start, end, rowStart, rowEnd)) {
      return row as ReservationRow;
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// OP-01: Create Reservation
// --------------------------------------------------------------------------
export async function createReservation(
  userId: string,
  hamsterId: string,
  start: Date,
  end: Date,
  now: Date = new Date()
) {
  if (!userId) {
    throw { status: 400, message: 'Chybí identifikátor studenta (user_id).' };
  }
  if (!isIntervalValid(start, end)) {
    throw { status: 400, message: 'Neplatný interval: start musí být menší než end.' };
  }
  if (!isAtLeast15MinBefore(now, start)) {
    throw { status: 400, message: 'Rezervaci lze vytvořit nejpozději 15 minut před začátkem (currentTime <= start - 15 min).' };
  }

  const hamsterRes = await pool.query('SELECT * FROM hamsters WHERE id = $1', [hamsterId]);
  if (hamsterRes.rows.length === 0) {
    throw { status: 404, message: `Křeček '${hamsterId}' nebyl nalezen v katalogu.` };
  }
  const hamster = hamsterRes.rows[0] as HamsterRow;
  if (!hamster.is_active) {
    throw { status: 400, message: `Křeček '${hamster.name}' není aktivní a nelze jej rezervovat.` };
  }

  // Předběžná kontrola kolize (BR-02)
  const conflict = await findConflictingReservation(pool, hamsterId, start, end);
  if (conflict) {
    throw { status: 409, message: `Křeček je v požadovaném čase již rezervován (kolize s rezervací ID ${conflict.id}).` };
  }

  // Předběžná kontrola denního limitu (BR-04)
  const limitCheck = await checkDailyLimitExceeded(pool, userId, hamsterId, start, end);
  if (limitCheck.exceeded) {
    throw {
      status: 400,
      message: `Překročení denního limitu 30 minut pro den ${limitCheck.day} (již vyčerpáno: ${limitCheck.currentMinutes} min, požadováno: ${limitCheck.requestedMinutes} min).`,
    };
  }

  // Vytvoření DRAFTu
  const insertRes = await pool.query(
    `INSERT INTO reservations (user_id, hamster_id, start_time, end_time, status)
     VALUES ($1, $2, $3, $4, 'DRAFT')
     RETURNING *`,
    [userId, hamsterId, start, end]
  );

  return insertRes.rows[0] as ReservationRow;
}

// --------------------------------------------------------------------------
// OP-02: Check Availability
// --------------------------------------------------------------------------
export async function checkAvailability(
  hamsterId: string,
  start: Date,
  end: Date
) {
  if (!isIntervalValid(start, end)) {
    throw { status: 400, message: 'Neplatný interval dotazu: start musí být menší než end.' };
  }

  const hamsterRes = await pool.query('SELECT * FROM hamsters WHERE id = $1', [hamsterId]);
  if (hamsterRes.rows.length === 0) {
    throw { status: 404, message: `Křeček '${hamsterId}' neexistuje.` };
  }
  const hamster = hamsterRes.rows[0] as HamsterRow;
  if (!hamster.is_active) {
    return { available: false, reason: 'Křeček není aktivní.' };
  }

  const conflict = await findConflictingReservation(pool, hamsterId, start, end);
  if (conflict) {
    return { available: false, reason: `Křeček je obsazen rezervací ID ${conflict.id} (${conflict.status}).` };
  }

  return { available: true };
}

// --------------------------------------------------------------------------
// OP-03: Confirm Reservation (včetně podpory Baseline v0.2 schvalování)
// --------------------------------------------------------------------------
export async function confirmReservation(
  reservationId: number,
  userId: string,
  now: Date = new Date()
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Uzamkneme řádek rezervace pro ochranu proti souběhu (REQ-07)
    const resResult = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );

    if (resResult.rows.length === 0) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }
    const reservation = resResult.rows[0] as ReservationRow;

    if (reservation.user_id !== userId) {
      throw { status: 403, message: 'K této rezervaci nemá student oprávnění.' };
    }
    if (reservation.status !== 'DRAFT') {
      throw { status: 400, message: `Rezervaci ve stavu '${reservation.status}' nelze potvrdit. Povolený výchozí stav je DRAFT.` };
    }

    const start = new Date(reservation.start_time);
    const end = new Date(reservation.end_time);

    // Časové pravidlo 15 minut předem
    if (!isAtLeast15MinBefore(now, start)) {
      throw {
        status: 400,
        message: 'Rezervaci lze potvrdit nejpozději 15 minut před začátkem (currentTime <= start - 15 min).',
        offerTimeShift: true,
      };
    }

    // Kontrola křečka
    const hamsterRes = await client.query('SELECT * FROM hamsters WHERE id = $1', [reservation.hamster_id]);
    const hamster = hamsterRes.rows[0] as HamsterRow;
    if (!hamster.is_active) {
      throw { status: 400, message: `Křeček '${hamster.name}' není aktivní.` };
    }

    // Transakční kontrola kolize (BR-02 / REQ-07)
    const conflict = await findConflictingReservation(client, reservation.hamster_id, start, end, reservationId);
    if (conflict) {
      throw { status: 409, message: `Nelze potvrdit: vznikla kolize s potvrzenou rezervací ID ${conflict.id}.` };
    }

    // Transakční kontrola denního limitu 30 minut (BR-04)
    const limitCheck = await checkDailyLimitExceeded(client, userId, reservation.hamster_id, start, end, reservationId);
    if (limitCheck.exceeded) {
      throw {
        status: 400,
        message: `Potvrzením by byl překročen denní limit 30 minut pro den ${limitCheck.day}.`,
      };
    }

    // Baseline v0.2 větvení: Vyžaduje schválení správcem křečka?
    const targetStatus: ReservationStatus = hamster.requires_approval ? 'PENDING_APPROVAL' : 'CONFIRMED';

    await client.query(
      'UPDATE reservations SET status = $1 WHERE id = $2',
      [targetStatus, reservationId]
    );

    // Outbox záznam o notifikaci (BR-06)
    const notifMsg = targetStatus === 'CONFIRMED'
      ? `Rezervace ID ${reservationId} byla úspěšně potvrzena.`
      : `Žádost o rezervaci ID ${reservationId} čeká na schválení správcem křečka.`;

    await client.query(
      `INSERT INTO notifications_outbox (reservation_id, recipient, message)
       VALUES ($1, $2, $3)`,
      [reservationId, userId, notifMsg]
    );

    await client.query('COMMIT');

    return {
      id: reservationId,
      status: targetStatus,
      hamster_id: reservation.hamster_id,
      requires_approval: hamster.requires_approval,
      message: notifMsg,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------------------
// OP-04: Cancel Reservation
// --------------------------------------------------------------------------
export async function cancelReservation(
  reservationId: number,
  userId: string,
  now: Date = new Date()
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resResult = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );

    if (resResult.rows.length === 0) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }
    const reservation = resResult.rows[0] as ReservationRow;

    if (reservation.user_id !== userId) {
      throw { status: 403, message: 'K této rezervaci nemá student oprávnění.' };
    }

    // Idempotentní úspěch: Pokud už je zrušená, vrátíme OK beze změny
    if (reservation.status === 'CANCELLED') {
      await client.query('COMMIT');
      return {
        id: reservationId,
        status: 'CANCELLED',
        idempotent: true,
        message: 'Rezervace již byla dříve zrušena (idempotentní úspěch).',
      };
    }

    if (reservation.status !== 'DRAFT' && reservation.status !== 'CONFIRMED' && reservation.status !== 'PENDING_APPROVAL') {
      throw { status: 400, message: `Rezervaci ve stavu '${reservation.status}' nelze zrušit.` };
    }

    const start = new Date(reservation.start_time);
    // Časové pravidlo pro storno: nejpozději 15 minut před začátkem
    if (!isAtLeast15MinBefore(now, start)) {
      throw {
        status: 400,
        message: 'Rezervaci lze zrušit nejpozději 15 minut před začátkem rezervace.',
      };
    }

    await client.query(
      'UPDATE reservations SET status = $1 WHERE id = $2',
      ['CANCELLED', reservationId]
    );

    await client.query(
      `INSERT INTO notifications_outbox (reservation_id, recipient, message)
       VALUES ($1, $2, $3)`,
      [reservationId, userId, `Rezervace ID ${reservationId} byla zrušena.`]
    );

    await client.query('COMMIT');

    return {
      id: reservationId,
      status: 'CANCELLED',
      idempotent: false,
      message: `Rezervace ID ${reservationId} byla úspěšně zrušena a uvolnila alokaci i limit.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------------------
// OP-05: Decide Reservation (Approve / Reject správcem křečka) — Baseline v0.2
// --------------------------------------------------------------------------
export async function decideReservation(
  reservationId: number,
  userRole: string,
  decision: 'APPROVE' | 'REJECT',
  now: Date = new Date()
) {
  const normalizedRole = (userRole || '').trim().toLowerCase();
  if (normalizedRole !== 'spravce' && normalizedRole !== 'manager') {
    throw { status: 403, message: 'Rozhodovat o žádostech může pouze Správce křečka (role: spravce nebo MANAGER).' };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resResult = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );

    if (resResult.rows.length === 0) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }
    const reservation = resResult.rows[0] as ReservationRow;

    if (reservation.status !== 'PENDING_APPROVAL') {
      throw { status: 400, message: `Rezervace není ve stavu PENDING_APPROVAL (její stav je ${reservation.status}).` };
    }

    const start = new Date(reservation.start_time);
    if (now.getTime() >= start.getTime()) {
      throw { status: 400, message: 'Nelze rozhodnout rezervaci, jejíž čas začátku již nastal nebo uplynul.' };
    }

    const newStatus: ReservationStatus = decision === 'APPROVE' ? 'CONFIRMED' : 'REJECTED';

    await client.query(
      'UPDATE reservations SET status = $1 WHERE id = $2',
      [newStatus, reservationId]
    );

    const msg = decision === 'APPROVE'
      ? `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka schválena.`
      : `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka zamítnuta.`;

    await client.query(
      `INSERT INTO notifications_outbox (reservation_id, recipient, message)
       VALUES ($1, $2, $3)`,
      [reservationId, reservation.user_id, msg]
    );

    await client.query('COMMIT');

    return {
      id: reservationId,
      status: newStatus,
      decision,
      message: msg,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------------------
// OP-06: Expire Pending Reservations (automatický časovač) — Baseline v0.2
// --------------------------------------------------------------------------
export async function expirePendingReservations(now: Date = new Date()) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Najdeme všechny PENDING_APPROVAL rezervace, kde do začátku zbývá méně než 1 hodina (currentTime >= start - 1h)
    const thresholdTime = new Date(now.getTime() + ONE_HOUR_MS);

    const res = await client.query(
      `SELECT * FROM reservations 
       WHERE status = 'PENDING_APPROVAL' AND start_time <= $1
       FOR UPDATE`,
      [thresholdTime]
    );

    const expiredIds: number[] = [];

    for (const row of res.rows) {
      await client.query('UPDATE reservations SET status = $1 WHERE id = $2', ['EXPIRED', row.id]);
      await client.query(
        `INSERT INTO notifications_outbox (reservation_id, recipient, message)
         VALUES ($1, $2, $3)`,
        [row.id, row.user_id, `Žádost o rezervaci ID ${row.id} expirovala z důvodu nečinnosti správce.`]
      );
      expiredIds.push(row.id);
    }

    await client.query('COMMIT');

    return {
      expiredCount: expiredIds.length,
      expiredIds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
