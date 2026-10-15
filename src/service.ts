import { PoolClient } from 'pg';
import { pool } from './db';
import { sendNotification } from './notification';
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
import {
  repository,
  ReservationRow,
  HamsterRow,
  OutboxRow,
  DbExecutor,
} from './repository';

export { ReservationRow, HamsterRow, OutboxRow };

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
      ('ferda', 'Ferda', true, false),
      ('archimedes', 'Archimedes', true, true),
      ('spavek', 'Spávek', false, false)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      is_active = EXCLUDED.is_active,
      requires_approval = EXCLUDED.requires_approval;
  `);
}

/**
 * Získání seznamu křečků z katalogu
 */
export async function getHamsters(): Promise<HamsterRow[]> {
  return await repository.getAllHamsters();
}

/**
 * Získání seznamu rezervací (s volitelným filtrem)
 */
export async function getReservations(userId?: string, status?: string): Promise<ReservationRow[]> {
  return await repository.getReservations(userId, status);
}

/**
 * Získání detailu rezervace podle ID
 */
export async function getReservationById(id: number): Promise<ReservationRow | null> {
  return await repository.findReservationById(pool, id);
}

/**
 * Pomocná funkce pro ověření denního limitu studenta pro konkrétního křečka
 */
async function checkDailyLimitExceeded(
  executor: DbExecutor,
  userId: string,
  hamsterId: string,
  newStart: Date,
  newEnd: Date,
  excludeReservationId?: number
): Promise<{ exceeded: boolean; day?: string; currentMinutes?: number; requestedMinutes?: number }> {
  const requestedMinutesMap = calculateMinutesPerDay(newStart, newEnd);
  const rows = await repository.findUserReservationsForHamster(executor, userId, hamsterId, excludeReservationId);

  const existingMinutesMap = new Map<string, number>();
  for (const row of rows) {
    const rowStart = new Date(row.start_time);
    const rowEnd = new Date(row.end_time);
    const rowMap = calculateMinutesPerDay(rowStart, rowEnd);

    for (const [day, mins] of rowMap.entries()) {
      existingMinutesMap.set(day, (existingMinutesMap.get(day) || 0) + mins);
    }
  }

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
  executor: DbExecutor,
  hamsterId: string,
  start: Date,
  end: Date,
  excludeReservationId?: number
): Promise<ReservationRow | null> {
  const rows = await repository.findActiveReservationsForHamster(executor, hamsterId, excludeReservationId);

  for (const row of rows) {
    const rowStart = new Date(row.start_time);
    const rowEnd = new Date(row.end_time);
    if (doIntervalsOverlap(start, end, rowStart, rowEnd)) {
      return row;
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

  const hamster = await repository.findHamsterById(pool, hamsterId);
  if (!hamster) {
    throw { status: 404, message: `Křeček '${hamsterId}' nebyl nalezen v katalogu.` };
  }
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

  // Vytvoření DRAFTu přes repository
  return await repository.insertReservation(userId, hamsterId, start, end, 'DRAFT');
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

  const hamster = await repository.findHamsterById(pool, hamsterId);
  if (!hamster) {
    throw { status: 404, message: `Křeček '${hamsterId}' neexistuje.` };
  }
  if (!hamster.is_active) {
    return { available: false, reason: 'Křeček není aktivní.' };
  }

  const conflict = await findConflictingReservation(pool, hamsterId, start, end);
  if (conflict) {
    return {
      available: false,
      reason: `Termín je obsazen rezervací ID ${conflict.id} (${conflict.status}).`,
    };
  }

  return { available: true };
}

// --------------------------------------------------------------------------
// OP-03: Confirm Reservation
// --------------------------------------------------------------------------
export async function confirmReservation(
  reservationId: number,
  userId: string,
  now: Date = new Date()
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }

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
    const hamster = await repository.findHamsterByIdForUpdate(client, reservation.hamster_id);
    if (!hamster || !hamster.is_active) {
      throw { status: 400, message: `Křeček '${hamster ? hamster.name : reservation.hamster_id}' není aktivní.` };
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

    await repository.updateReservationStatus(client, reservationId, targetStatus);

    // Outbox záznam o notifikaci (BR-06)
    const notifMsg = targetStatus === 'CONFIRMED'
      ? `Rezervace ID ${reservationId} byla úspěšně potvrzena.`
      : `Žádost o rezervaci ID ${reservationId} čeká na schválení správcem křečka.`;

    const notificationId = await repository.insertOutboxNotification(client, reservationId, userId, notifMsg);

    if (targetStatus === 'PENDING_APPROVAL') {
      await repository.insertOutboxNotification(
        client,
        reservationId,
        `spravce:${reservation.hamster_id}`,
        `Rezervace ID ${reservationId} čeká na vaše schválení.`
      );
    }

    await client.query('COMMIT');

    let warning: string | undefined;

    try {
      await sendNotification(userId, notifMsg);
      await repository.updateOutboxStatus(notificationId, 'SENT');
    } catch {
      warning = 'Oznámení se nepodařilo doručit a zůstává evidované pro pozdější opakování.';
      await repository.updateOutboxStatus(notificationId, 'FAILED');
    }

    return {
      id: reservationId,
      status: targetStatus,
      hamster_id: reservation.hamster_id,
      requires_approval: hamster.requires_approval,
      message: notifMsg,
      warning,
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

    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }

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

    await repository.updateReservationStatus(client, reservationId, 'CANCELLED');

    const notifMsg = `Rezervace ID ${reservationId} byla zrušena.`;
    const notificationId = await repository.insertOutboxNotification(client, reservationId, userId, notifMsg);

    await client.query('COMMIT');

    let warning: string | undefined;

    try {
      await sendNotification(userId, notifMsg);
      await repository.updateOutboxStatus(notificationId, 'SENT');
    } catch {
      warning = 'Oznámení se nepodařilo doručit a zůstává evidované pro pozdější opakování.';
      await repository.updateOutboxStatus(notificationId, 'FAILED');
    }

    return {
      id: reservationId,
      status: 'CANCELLED',
      message: `Rezervace ID ${reservationId} byla úspěšně zrušena a uvolnila alokaci i limit.`,
      warning,
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

    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) {
      throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    }

    if (reservation.status !== 'PENDING_APPROVAL') {
      throw { status: 400, message: `Rezervace není ve stavu PENDING_APPROVAL (její stav je ${reservation.status}).` };
    }

    const start = new Date(reservation.start_time);
    if (now.getTime() >= start.getTime() - ONE_HOUR_MS) {
      throw {
        status: 400,
        message: 'Lhůta pro rozhodnutí správce již vypršela; žádost má být expirována.',
      };
    }

    const hamster = await repository.findHamsterByIdForUpdate(client, reservation.hamster_id);
    if (!hamster) {
      throw { status: 404, message: `Křeček '${reservation.hamster_id}' neexistuje.` };
    }

    if (decision === 'APPROVE' && !hamster.is_active) {
      throw {
        status: 400,
        message: `Křeček '${hamster.name}' není aktivní a žádost nelze schválit.`,
      };
    }

    const newStatus: ReservationStatus = decision === 'APPROVE' ? 'CONFIRMED' : 'REJECTED';

    await repository.updateReservationStatus(client, reservationId, newStatus);

    const msg = decision === 'APPROVE'
      ? `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka schválena.`
      : `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka zamítnuta.`;

    await repository.insertOutboxNotification(client, reservationId, reservation.user_id, msg);

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

    // Najdeme všechny PENDING_APPROVAL rezervace, kde do začátku zbývá nejvýše 1 hodina (currentTime >= start - 1h)
    const thresholdTime = new Date(now.getTime() + ONE_HOUR_MS);
    const expiredRows = await repository.findPendingReservationsBeforeTime(thresholdTime);

    const expiredIds: number[] = [];

    for (const row of expiredRows) {
      await repository.updateReservationStatus(client, row.id, 'EXPIRED');
      await repository.insertOutboxNotification(
        client,
        row.id,
        row.user_id,
        `Žádost o rezervaci ID ${row.id} expirovala z důvodu nečinnosti správce.`
      );
      await repository.insertOutboxNotification(
        client,
        row.id,
        `spravce:${row.hamster_id}`,
        `Žádost o rezervaci ID ${row.id} expirovala bez rozhodnutí.`
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
