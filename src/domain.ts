/**
 * Doménová pravidla rezervačního systému Křečkomat
 * Implementace pravidel BR-01 až BR-07 a baseline v0.2.
 */

export interface TimeInterval {
  start: Date;
  end: Date;
}

export type ReservationStatus = 
  | 'DRAFT' 
  | 'CONFIRMED' 
  | 'CANCELLED' 
  | 'PENDING_APPROVAL' 
  | 'REJECTED' 
  | 'EXPIRED';

export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const MAX_DAILY_MINUTES = 30;

/**
 * BR-01: Ověření platnosti intervalu [start, end)
 * start < end
 */
export function isIntervalValid(start: Date, end: Date): boolean {
  return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start.getTime() < end.getTime();
}

/**
 * BR-01 & BR-03: Časová mezní podmínka
 * Akce musí být podána nejpozději 15 minut před začátkem rezervace:
 * currentTime <= start - 15 minut
 */
export function isAtLeast15MinBefore(now: Date, start: Date): boolean {
  return now.getTime() <= (start.getTime() - FIFTEEN_MINUTES_MS);
}

/**
 * BR-01: Průnik polouzavřených intervalů [A.start, A.end) a [B.start, B.end)
 * Překrývají se, pokud A.start < B.end a současně B.start < A.end.
 * Pouhý dotyk hranic (A.end == B.start) není překryv.
 */
export function doIntervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Získá kalendářní den (YYYY-MM-DD) pro daný Date v časovém pásmu Europe/Prague.
 */
export function getPragueDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * BR-04: Výpočet minut v jednotlivých kalendářních dnech (Europe/Prague).
 * Rozdělí interval přes půlnoc a spočítá počet minut pro každý dotčený kalendářní den.
 */
export function calculateMinutesPerDay(start: Date, end: Date): Map<string, number> {
  const result = new Map<string, number>();
  
  // Procházíme po minutových krocích nebo hodinových blocích pro přesné započtení v pásmu Europe/Prague
  let current = new Date(start.getTime());
  const endTime = end.getTime();

  while (current.getTime() < endTime) {
    const dayStr = getPragueDateString(current);
    const existing = result.get(dayStr) || 0;
    
    // Zjistíme, kolik milisekund zbývá do konce intervalu nebo do konce minuty
    const currentMs = current.getTime();

    const nextMinuteBoundary =
      (Math.floor(currentMs / (60 * 1000)) + 1) * (60 * 1000);

    const stepEnd = Math.min(nextMinuteBoundary, endTime);

    const durationMinutes =
      (stepEnd - currentMs) / (60 * 1000);

    result.set(dayStr, existing + durationMinutes);
    current = new Date(stepEnd);
  }

  return result;
}

/**
 * BR-02 & v0.2: Zjištění, zda stav rezervace blokuje dostupnost křečka.
 * CONFIRMED i PENDING_APPROVAL blokují dostupnost.
 */
export function blocksHamsterAvailability(status: ReservationStatus): boolean {
  return status === 'CONFIRMED' || status === 'PENDING_APPROVAL';
}

/**
 * BR-04 & v0.2: Zjištění, zda stav rezervace čerpá denní limit studenta.
 * CONFIRMED i PENDING_APPROVAL dočasně či trvale čerpají limit.
 */
export function countsTowardDailyLimit(status: ReservationStatus): boolean {
  return status === 'CONFIRMED' || status === 'PENDING_APPROVAL';
}

/* ========================================================================= */
/* C05 Detailed Design — Reservation Confirmation & Availability Policy      */
/* ========================================================================= */

export interface ConfirmationCandidate {
  id?: number;
  userId: string;
  hamsterId: string;
  start: Date;
  end: Date;
  status: ReservationStatus;
}

export interface HamsterProfile {
  id: string;
  name: string;
  isActive: boolean;
  requiresApproval: boolean;
}

export type ConfirmationErrorCode = 
  | 'INVALID_INTERVAL'
  | 'LEAD_TIME_VIOLATION'
  | 'HAMSTER_INACTIVE'
  | 'INVALID_STATE'
  | 'SLOT_CONFLICT'
  | 'DAILY_LIMIT_EXCEEDED';

export interface ConfirmationSuccess {
  ok: true;
  targetStatus: 'CONFIRMED' | 'PENDING_APPROVAL';
  message: string;
}

export interface ConfirmationFailure {
  ok: false;
  code: ConfirmationErrorCode;
  message: string;
  details?: {
    day?: string;
    currentMinutes?: number;
    requestedMinutes?: number;
    conflictingSlot?: TimeInterval;
  };
}

export type ConfirmationResult = ConfirmationSuccess | ConfirmationFailure;

/**
 * Klíčové rozhraní kontraktu pro vyhodnocení přechodu rezervace z DRAFT do cílového stavu (C05 DD Krok 3).
 */
export interface IConfirmationPolicy {
  /**
   * Vyhodnotí všechny doménové invarianty a rozhodne cílový stav rezervace.
   *
   * @param candidate Navrhovaná rezervace k potvrzení
   * @param hamster Profil křečka (aktivita, nutnost schválení)
   * @param existingConfirmedIntervals Již blokované intervaly křečka
   * @param userDailyMinutes Již vyčerpané minuty studenta po kalendářních dnech (Europe/Prague)
   * @param currentTime Aktuální čas ověření
   * @returns ConfirmationResult (úspěch s cílovým stavem nebo selhání s kódem chyby)
   */
  evaluate(
    candidate: ConfirmationCandidate,
    hamster: HamsterProfile,
    existingConfirmedIntervals: TimeInterval[],
    userDailyMinutes: Map<string, number>,
    currentTime: Date
  ): ConfirmationResult;
}

/**
 * Konkrétní implementace Confirmation Policy (C05 DD Krok 3 & 4).
 * Čistá doménová logika bez I/O závislostí a bez vedlejších efektů.
 */
export class ConfirmationPolicy implements IConfirmationPolicy {
  evaluate(
    candidate: ConfirmationCandidate,
    hamster: HamsterProfile,
    existingConfirmedIntervals: TimeInterval[],
    userDailyMinutes: Map<string, number>,
    currentTime: Date
  ): ConfirmationResult {
    // 1. Validace časového intervalu (BR-01)
    if (!isIntervalValid(candidate.start, candidate.end)) {
      return {
        ok: false,
        code: 'INVALID_INTERVAL',
        message: 'Časový interval rezervace je neplatný (konec musí být po začátku).'
      };
    }

    // 2. Časový předstih min. 15 minut (BR-01 & BR-03)
    if (!isAtLeast15MinBefore(currentTime, candidate.start)) {
      return {
        ok: false,
        code: 'LEAD_TIME_VIOLATION',
        message: 'Rezervaci lze potvrdit nejpozději 15 minut před jejím začátkem.'
      };
    }

    // 3. Aktivita křečka
    if (!hamster.isActive) {
      return {
        ok: false,
        code: 'HAMSTER_INACTIVE',
        message: `Křeček ${hamster.name} momentálně není aktivní pro rezervace.`
      };
    }

    // 4. Výchozí stav musí být DRAFT
    if (candidate.status !== 'DRAFT') {
      return {
        ok: false,
        code: 'INVALID_STATE',
        message: `Rezervaci ve stavu ${candidate.status} již nelze znovu potvrdit.`
      };
    }

    // 5. Nekoliznost termínu — žádný překryv s existujícími termíny (BR-02)
    for (const slot of existingConfirmedIntervals) {
      if (doIntervalsOverlap(candidate.start, candidate.end, slot.start, slot.end)) {
        return {
          ok: false,
          code: 'SLOT_CONFLICT',
          message: `Křeček ${hamster.name} je v požadovaném čase již rezervován.`,
          details: { conflictingSlot: slot }
        };
      }
    }

    // 6. Denní limit studenta max. 30 minut (BR-04)
    const requestedMinutesMap = calculateMinutesPerDay(candidate.start, candidate.end);
    for (const [day, requestedMins] of requestedMinutesMap.entries()) {
      const existingMins = userDailyMinutes.get(day) || 0;
      if (existingMins + requestedMins > MAX_DAILY_MINUTES) {
        return {
          ok: false,
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `Překročen denní limit 30 minut pro den ${day}. Vyčerpáno: ${existingMins} min, požadováno: ${requestedMins} min.`,
          details: {
            day,
            currentMinutes: existingMins,
            requestedMinutes: requestedMins
          }
        };
      }
    }

    // 7. Rozhodnutí cílového stavu (BR-05)
    const targetStatus = hamster.requiresApproval ? 'PENDING_APPROVAL' : 'CONFIRMED';
    const message = hamster.requiresApproval
      ? `Rezervace vyžaduje schválení správcem kabinetu (stav PENDING_APPROVAL).`
      : `Rezervace byla úspěšně závazně potvrzena (stav CONFIRMED).`;

    return {
      ok: true,
      targetStatus,
      message
    };
  }
}

export const confirmationPolicy = new ConfirmationPolicy();

