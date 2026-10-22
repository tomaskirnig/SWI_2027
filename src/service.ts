import { sendNotification } from './notification';
import {
  confirmationPolicy, isIntervalValid, isAtLeast15MinBefore,
  doIntervalsOverlap, calculateMinutesPerDay, MAX_DAILY_MINUTES,
  ONE_HOUR_MS, formatPragueTime24h,
} from './domain';
import { repository, ReservationRow, HamsterRow, OutboxRow, DbExecutor } from './repository';

export { ReservationRow, HamsterRow, OutboxRow };

export async function initializeDatabase(): Promise<void> {
  await repository.initializeDatabase();
}

export async function getHamsters(): Promise<HamsterRow[]> {
  return repository.getAllHamsters();
}

export async function getReservations(userId?: string, status?: string): Promise<ReservationRow[]> {
  return repository.getReservations(userId, status);
}

export async function getReservationById(id: number): Promise<ReservationRow | null> {
  return repository.findReservationById(undefined, id);
}

async function userDailyMinutes(
  executor: DbExecutor | undefined,
  userId: string,
  hamsterId: string,
  excludeReservationId?: number,
): Promise<Map<string, number>> {
  const rows = await repository.findUserReservationsForHamster(executor, userId, hamsterId, excludeReservationId);
  const minutes = new Map<string, number>();
  for (const row of rows) {
    for (const [day, duration] of calculateMinutesPerDay(new Date(row.start_time), new Date(row.end_time))) {
      minutes.set(day, (minutes.get(day) || 0) + duration);
    }
  }
  return minutes;
}

async function findConflictingReservation(hamsterId: string, start: Date, end: Date) {
  const rows = await repository.findActiveReservationsForHamster(undefined, hamsterId);
  return rows.find(row => doIntervalsOverlap(start, end, new Date(row.start_time), new Date(row.end_time)));
}

// Volá se až po úspěšném COMMIT a uvolnění transakčního klienta.
async function attemptNotification(id: number, recipient: string, message: string): Promise<string | undefined> {
  try {
    await sendNotification(recipient, message);
    await repository.updateOutboxStatus(id, 'SENT');
  } catch {
    await repository.updateOutboxStatus(id, 'FAILED');
    return 'Oznámení se nepodařilo doručit a zůstává evidované pro pozdější opakování.';
  }
}

// OP-01: nezávazný DRAFT s předběžnou kontrolou dostupnosti a limitu.
export async function createReservation(
  userId: string, hamsterId: string, start: Date, end: Date, now: Date = new Date(),
) {
  if (!userId) throw { status: 400, message: 'Chybí identifikátor studenta (user_id).' };
  if (!isIntervalValid(start, end)) throw { status: 400, message: 'Neplatný interval: start musí být menší než end.' };
  if (!isAtLeast15MinBefore(now, start)) {
    throw { status: 400, message: 'Rezervaci lze vytvořit nejpozději 15 minut před začátkem (currentTime <= start - 15 min).' };
  }
  const hamster = await repository.findHamsterById(undefined, hamsterId);
  if (!hamster) throw { status: 404, message: `Křeček '${hamsterId}' nebyl nalezen v katalogu.` };
  if (!hamster.is_active) throw { status: 400, message: `Křeček '${hamster.name}' není aktivní a nelze jej rezervovat.` };
  const conflict = await findConflictingReservation(hamsterId, start, end);
  if (conflict) {
    const interval = `${formatPragueTime24h(new Date(conflict.start_time))}–${formatPragueTime24h(new Date(conflict.end_time))}`;
    throw { status: 409, message: `Křeček je v požadovaném čase již rezervován (kolize s rezervací ID ${conflict.id}, ${interval}).` };
  }
  const existingMinutes = await userDailyMinutes(undefined, userId, hamsterId);
  for (const [day, requested] of calculateMinutesPerDay(start, end)) {
    const used = existingMinutes.get(day) || 0;
    if (used + requested > MAX_DAILY_MINUTES) {
      const [y, m, d] = day.split('-');
      throw { status: 400, message: `Překročení denního limitu 30 minut pro den ${d}.${m}.${y} (již vyčerpáno: ${used} min, požadováno: ${requested} min).` };
    }
  }
  return repository.insertReservation(userId, hamsterId, start, end, 'DRAFT');
}

// OP-02: veřejný čtecí dotaz v demonstračním prototypu.
export async function checkAvailability(hamsterId: string, start: Date, end: Date) {
  if (!isIntervalValid(start, end)) {
    throw { status: 400, message: 'Neplatný interval dotazu: start musí být menší než end.' };
  }
  const hamster = await repository.findHamsterById(undefined, hamsterId);
  if (!hamster) throw { status: 404, message: `Křeček '${hamsterId}' neexistuje.` };
  if (!hamster.is_active) return { available: false, reason: 'Křeček není aktivní.' };
  const conflict = await findConflictingReservation(hamsterId, start, end);
  if (conflict) {
    const interval = `${formatPragueTime24h(new Date(conflict.start_time))}–${formatPragueTime24h(new Date(conflict.end_time))}`;
    return { available: false, reason: `Termín je obsazen rezervací ID ${conflict.id} (${interval}, ${conflict.status}).` };
  }
  return { available: true };
}

// OP-03: služba zajišťuje data a vlastnictví, policy rozhoduje business pravidla.
export async function confirmReservation(reservationId: number, userId: string, now: Date = new Date()) {
  const confirmed = await repository.withTransaction(async client => {
    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    if (reservation.user_id !== userId) throw { status: 403, message: 'K této rezervaci nemá student oprávnění.' };
    // Zámek křečka serializuje alokace i čerpání limitu stejné dvojice.
    const hamster = await repository.findHamsterByIdForUpdate(client, reservation.hamster_id);
    if (!hamster) throw { status: 404, message: `Křeček '${reservation.hamster_id}' neexistuje.` };
    const activeRows = await repository.findActiveReservationsForHamster(client, hamster.id, reservationId);
    const dailyMinutes = await userDailyMinutes(client, userId, hamster.id, reservationId);
    const decision = confirmationPolicy.evaluate(
      {
        id: reservation.id, userId, hamsterId: hamster.id,
        start: new Date(reservation.start_time), end: new Date(reservation.end_time), status: reservation.status,
      },
      { id: hamster.id, name: hamster.name, isActive: hamster.is_active, requiresApproval: hamster.requires_approval },
      activeRows.map(row => ({ start: new Date(row.start_time), end: new Date(row.end_time) })),
      dailyMinutes,
      now,
    );
    if (!decision.ok) {
      throw { status: decision.code === 'SLOT_CONFLICT' ? 409 : 400, code: decision.code, message: decision.message };
    }
    await repository.updateReservationStatus(client, reservationId, decision.targetStatus);
    const message = decision.targetStatus === 'CONFIRMED'
      ? `Rezervace ID ${reservationId} byla úspěšně potvrzena.`
      : `Žádost o rezervaci ID ${reservationId} čeká na schválení správcem křečka.`;
    const notificationId = await repository.insertOutboxNotification(client, reservationId, userId, message);
    if (decision.targetStatus === 'PENDING_APPROVAL') {
      await repository.insertOutboxNotification(client, reservationId, `spravce:${hamster.id}`, `Rezervace ID ${reservationId} čeká na vaše schválení.`);
    }
    return {
      notificationId,
      response: { id: reservationId, status: decision.targetStatus, hamster_id: hamster.id, requires_approval: hamster.requires_approval, message },
    };
  });
  const warning = await attemptNotification(confirmed.notificationId, userId, confirmed.response.message);
  return { ...confirmed.response, warning };
}

// OP-04: řádkový zámek chrání přechod i idempotentní opakování.
export async function cancelReservation(reservationId: number, userId: string, now: Date = new Date()) {
  const cancelled = await repository.withTransaction(async client => {
    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    if (reservation.user_id !== userId) throw { status: 403, message: 'K této rezervaci nemá student oprávnění.' };
    if (reservation.status === 'CANCELLED') return { notificationId: undefined, idempotent: true };
    if (!['DRAFT', 'CONFIRMED', 'PENDING_APPROVAL'].includes(reservation.status)) {
      throw { status: 400, message: `Rezervaci ve stavu '${reservation.status}' nelze zrušit.` };
    }
    if (!isAtLeast15MinBefore(now, new Date(reservation.start_time))) {
      throw { status: 400, message: 'Rezervaci lze zrušit nejpozději 15 minut před začátkem rezervace.' };
    }
    await repository.updateReservationStatus(client, reservationId, 'CANCELLED');
    const notificationId = await repository.insertOutboxNotification(client, reservationId, userId, `Rezervace ID ${reservationId} byla zrušena.`);
    return { notificationId, idempotent: false };
  });
  if (cancelled.idempotent) {
    return { id: reservationId, status: 'CANCELLED', idempotent: true, message: 'Rezervace již byla dříve zrušena (idempotentní úspěch).' };
  }
  const warning = await attemptNotification(cancelled.notificationId!, userId, `Rezervace ID ${reservationId} byla zrušena.`);
  return { id: reservationId, status: 'CANCELLED', idempotent: false, message: `Rezervace ID ${reservationId} byla úspěšně zrušena a uvolnila alokaci i limit.`, warning };
}

// OP-05: prototyp garantuje uložení požadavku na oznámení, nikoli jeho doručení.
export async function decideReservation(
  reservationId: number, userRole: string, decision: 'APPROVE' | 'REJECT', now: Date = new Date(),
) {
  if (!['spravce', 'manager'].includes((userRole || '').trim().toLowerCase())) {
    throw { status: 403, message: 'Rozhodovat o žádostech může pouze Správce křečka (role: spravce nebo MANAGER).' };
  }
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    throw { status: 400, message: 'Pole decision musí být buď APPROVE nebo REJECT.' };
  }
  return repository.withTransaction(async client => {
    const reservation = await repository.findReservationByIdForUpdate(client, reservationId);
    if (!reservation) throw { status: 404, message: `Rezervace ID ${reservationId} neexistuje.` };
    if (reservation.status !== 'PENDING_APPROVAL') {
      throw { status: 400, message: `Rezervace není ve stavu PENDING_APPROVAL (její stav je ${reservation.status}).` };
    }
    if (now.getTime() >= new Date(reservation.start_time).getTime() - ONE_HOUR_MS) {
      throw { status: 400, message: 'Lhůta pro rozhodnutí správce již vypršela; žádost má být expirována.' };
    }
    const hamster = await repository.findHamsterByIdForUpdate(client, reservation.hamster_id);
    if (!hamster) throw { status: 404, message: `Křeček '${reservation.hamster_id}' neexistuje.` };
    if (decision === 'APPROVE' && !hamster.is_active) {
      throw { status: 400, message: `Křeček '${hamster.name}' není aktivní a žádost nelze schválit.` };
    }
    const status = decision === 'APPROVE' ? 'CONFIRMED' : 'REJECTED';
    const message = decision === 'APPROVE'
      ? `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka schválena.`
      : `Vaše žádost o rezervaci ID ${reservationId} byla správcem křečka zamítnuta.`;
    await repository.updateReservationStatus(client, reservationId, status);
    await repository.insertOutboxNotification(client, reservationId, reservation.user_id, message);
    return { id: reservationId, status, decision, message };
  });
}

// OP-06: výběr, zámky, změny i outbox patří do jedné transakce.
export async function expirePendingReservations(now: Date = new Date()) {
  return repository.withTransaction(async client => {
    const threshold = new Date(now.getTime() + ONE_HOUR_MS);
    const rows = await repository.findPendingReservationsBeforeTimeForUpdate(client, threshold);
    const expiredIds: number[] = [];
    for (const row of rows) {
      await repository.updateReservationStatus(client, row.id, 'EXPIRED');
      await repository.insertOutboxNotification(client, row.id, row.user_id, `Žádost o rezervaci ID ${row.id} expirovala z důvodu nečinnosti správce.`);
      await repository.insertOutboxNotification(client, row.id, `spravce:${row.hamster_id}`, `Žádost o rezervaci ID ${row.id} expirovala bez rozhodnutí.`);
      expiredIds.push(row.id);
    }
    return { expiredCount: expiredIds.length, expiredIds };
  });
}
