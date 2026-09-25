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
    const nextMinute = new Date(current.getTime() + 60 * 1000);
    const stepEnd = nextMinute.getTime() > endTime ? endTime : nextMinute.getTime();
    const durationMinutes = (stepEnd - current.getTime()) / (60 * 1000);
    
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
