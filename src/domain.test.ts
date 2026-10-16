import assert from 'node:assert/strict';
import {
  ConfirmationPolicy,
  ConfirmationCandidate,
  HamsterProfile,
  TimeInterval,
  calculateMinutesPerDay,
  doIntervalsOverlap,
  isAtLeast15MinBefore,
  isIntervalValid,
} from './domain';

console.log('=== Křečkomat – Unit testy odvozené z Detailed Designu (C05 DD) ===\n');

const policy = new ConfirmationPolicy();

// Pomocné profily křečků
const ferda: HamsterProfile = {
  id: 'ferda',
  name: 'Ferda',
  isActive: true,
  requiresApproval: false,
};

const archimedes: HamsterProfile = {
  id: 'archimedes',
  name: 'Archimedes',
  isActive: true,
  requiresApproval: true,
};

const spavek: HamsterProfile = {
  id: 'spavek',
  name: 'Spávek',
  isActive: false,
  requiresApproval: false,
};

let passedCount = 0;
let failedCount = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Chyba: ${err.message}`);
    failedCount++;
  }
}

// ---------------------------------------------------------------------------
// T-DD-01: Interface Contract — Neplatný interval
// ---------------------------------------------------------------------------
runTest('T-DD-01: Interface Contract — Neplatný interval (start >= end) vrátí INVALID_INTERVAL', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:30:00Z'),
    end: new Date('2027-10-01T14:00:00Z'), // Konec před začátkem
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, ferda, [], new Map(), now);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INVALID_INTERVAL');
  }
});

// ---------------------------------------------------------------------------
// T-DD-02: Algorithm Branch — Časový předstih min. 15 minut (BR-03)
// ---------------------------------------------------------------------------
runTest('T-DD-02: Algorithm Branch — Potvrzení méně než 15 min před začátkem vrátí LEAD_TIME_VIOLATION', () => {
  const start = new Date('2027-10-01T14:00:00Z');
  const end = new Date('2027-10-01T14:30:00Z');
  const nowLate = new Date('2027-10-01T13:46:00Z'); // Jen 14 minut před začátkem!

  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'ferda',
    start,
    end,
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, ferda, [], new Map(), nowLate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'LEAD_TIME_VIOLATION');
  }
});

// ---------------------------------------------------------------------------
// T-DD-03: Failure Behavior — Neaktivní křeček
// ---------------------------------------------------------------------------
runTest('T-DD-03: Failure Behavior — Neaktivní křeček (isActive = false) vrátí HAMSTER_INACTIVE', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'spavek',
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, spavek, [], new Map(), now);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'HAMSTER_INACTIVE');
  }
});

// ---------------------------------------------------------------------------
// T-DD-04: State Transition — Větvení CONFIRMED vs PENDING_APPROVAL (BR-05)
// ---------------------------------------------------------------------------
runTest('T-DD-04A: State Transition — Běžný křeček přejde přímo do stavu CONFIRMED', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, ferda, [], new Map(), now);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.targetStatus, 'CONFIRMED');
  }
});

runTest('T-DD-04B: State Transition — Křeček vyžadující dohled přejde do stavu PENDING_APPROVAL', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'archimedes',
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, archimedes, [], new Map(), now);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.targetStatus, 'PENDING_APPROVAL');
  }
});

// ---------------------------------------------------------------------------
// T-DD-05: Collision Detection — Polouzavřené intervaly a dotyk hranic (BR-01 & BR-02)
// ---------------------------------------------------------------------------
runTest('T-DD-05A: Collision Detection — Překryv intervalů vrátí SLOT_CONFLICT', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const existingSlot: TimeInterval = {
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
  };

  const candidateOverlap: ConfirmationCandidate = {
    userId: 'student_jana',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:15:00Z'), // Překryv 14:15 - 14:45
    end: new Date('2027-10-01T14:45:00Z'),
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidateOverlap, ferda, [existingSlot], new Map(), now);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'SLOT_CONFLICT');
  }
});

runTest('T-DD-05B: Collision Detection — Pouhý dotyk hranic (14:30) není kolize a projde', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const existingSlot: TimeInterval = {
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
  };

  const candidateTouching: ConfirmationCandidate = {
    userId: 'student_jana',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:30:00Z'), // Začíná přesně v okamžiku konce předchozího
    end: new Date('2027-10-01T15:00:00Z'),
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidateTouching, ferda, [existingSlot], new Map(), now);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// T-DD-06: Daily Limit Calculation — Max. 30 minut na den (BR-04)
// ---------------------------------------------------------------------------
runTest('T-DD-06A: Daily Limit — Čerpání 20 min + požadavek 15 min překročí limit 30 min', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const userDailyMinutes = new Map<string, number>();
  userDailyMinutes.set('2027-10-01', 20); // Již vyčerpáno 20 minut

  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:15:00Z'), // Požadavek 15 minut (celkem 35 > 30)
    status: 'DRAFT',
  };

  const result = policy.evaluate(candidate, ferda, [], userDailyMinutes, now);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'DAILY_LIMIT_EXCEEDED');
    assert.equal(result.details?.currentMinutes, 20);
    assert.equal(result.details?.requestedMinutes, 15);
  }
});

runTest('T-DD-06B: Daily Limit — Rozpad intervalu přes půlnoc rozdělí minuty do dvou dnů', () => {
  // 23:50 UTC = 01:50 SELČ (letní čas) nebo 00:50 SEČ (zimní). 
  // Otestujeme přímé volání calculateMinutesPerDay pro ověření dvoudenního rozpadu:
  const day1 = new Date('2027-10-01T21:50:00Z'); // 23:50 v Europe/Prague (letní čas UTC+2)
  const day2 = new Date('2027-10-01T22:10:00Z'); // 00:10 v Europe/Prague následujícího dne
  
  const map = calculateMinutesPerDay(day1, day2);
  assert.equal(map.size, 2);
  assert.equal(map.get('2027-10-01'), 10);
  assert.equal(map.get('2027-10-02'), 10);
});

// ---------------------------------------------------------------------------
// T-DD-07: Invariant — Opakované potvrzení neplatného stavu
// ---------------------------------------------------------------------------
runTest('T-DD-07: Invariant — Rezervaci ve stavu CANCELLED nelze potvrdit', () => {
  const now = new Date('2027-10-01T10:00:00Z');
  const candidate: ConfirmationCandidate = {
    userId: 'student_tomas',
    hamsterId: 'ferda',
    start: new Date('2027-10-01T14:00:00Z'),
    end: new Date('2027-10-01T14:30:00Z'),
    status: 'CANCELLED',
  };

  const result = policy.evaluate(candidate, ferda, [], new Map(), now);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INVALID_STATE');
  }
});

console.log('----------------------------------------');
console.log(`PASS: ${passedCount}`);
console.log(`FAIL: ${failedCount}`);
console.log(`CELKEM: ${passedCount + failedCount}`);
console.log('----------------------------------------\n');

if (failedCount > 0) {
  process.exit(1);
}
