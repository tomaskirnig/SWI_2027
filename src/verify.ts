import { pool } from './db';
import {
  initializeDatabase,
  createReservation,
  checkAvailability,
  confirmReservation,
  cancelReservation,
  decideReservation,
  expirePendingReservations,
} from './service';

import {
  setNotificationSender,
  resetNotificationSender,
} from './notification';
import { assert } from 'console';

type Scenario = {
  id: string;
  name: string;
  run: () => Promise<void>;
};



async function expectError(
  operation: () => Promise<unknown>,
  expectedStatus?: number
): Promise<any> {
  try {
    await operation();
  } catch (err: any) {
    if (
      expectedStatus !== undefined &&
      err?.status !== expectedStatus
    ) {
      throw new Error(
        `Očekáván status ${expectedStatus}, ale přišel ${err?.status}: ${err?.message}`
      );
    }

    return err;
  }

  throw new Error('Operace měla skončit chybou, ale uspěla.');
}

async function resetDatabase(): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE notifications_outbox, reservations RESTART IDENTITY'
  );

  // Zároveň obnoví výchozí vlastnosti křečků.
  await initializeDatabase();
}

async function insertReservation(
  userId: string,
  hamsterId: string,
  start: Date,
  end: Date,
  status: string
): Promise<number> {
  const result = await pool.query(
    `INSERT INTO reservations
       (user_id, hamster_id, start_time, end_time, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, hamsterId, start, end, status]
  );

  return result.rows[0].id;
}

async function reservationStatus(id: number): Promise<string> {
  const result = await pool.query(
    'SELECT status FROM reservations WHERE id = $1',
    [id]
  );

  assert(result.rows.length === 1, `Rezervace ${id} nebyla nalezena.`);
  return result.rows[0].status;
}

async function notificationCount(
  reservationId?: number
): Promise<number> {
  if (reservationId === undefined) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications_outbox'
    );
    return result.rows[0].count;
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications_outbox
     WHERE reservation_id = $1`,
    [reservationId]
  );

  return result.rows[0].count;
}

// Pevný čas kvůli deterministickým testům.
// Červen 2030 = bezpečně v budoucnosti.
const NOW = new Date('2030-06-10T08:00:00+02:00');

function d(time: string): Date {
  return new Date(`2030-06-10T${time}+02:00`);
}

const scenarios: Scenario[] = [
  {
    id: 'V-01',
    name: 'Platný Create vytvoří DRAFT',
    run: async () => {
      await resetDatabase();

      const reservation = await createReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        NOW
      );

      assert(reservation.status === 'DRAFT', 'Očekáván stav DRAFT.');
      assert(typeof reservation.id === 'number', 'Chybí ID rezervace.');
    },
  },

  {
    id: 'V-02',
    name: 'Neplatný interval nebo pozdní Create je odmítnut',
    run: async () => {
      await resetDatabase();

      await expectError(() =>
        createReservation(
          'student-a',
          'ferda',
          d('10:00:00'),
          d('10:00:00'),
          NOW
        )
      );

      await expectError(() =>
        createReservation(
          'student-a',
          'ferda',
          d('10:20:00'),
          d('10:00:00'),
          NOW
        )
      );

      const lateNow = d('09:50:00');

      await expectError(() =>
        createReservation(
          'student-a',
          'ferda',
          d('10:00:00'),
          d('10:10:00'),
          lateNow
        )
      );

      const count = await pool.query(
        'SELECT COUNT(*)::int AS count FROM reservations'
      );

      assert(count.rows[0].count === 0, 'Neměla vzniknout žádná rezervace.');
    },
  },

  {
    id: 'V-03',
    name: 'Neexistující křeček je odmítnut',
    run: async () => {
      await resetDatabase();

      await expectError(
        () =>
          createReservation(
            'student-a',
            'neexistuje',
            d('10:00:00'),
            d('10:20:00'),
            NOW
          ),
        404
      );
    },
  },

  {
    id: 'V-04',
    name: 'CONFIRMED blokuje Create, DRAFT neblokuje',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-x',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      await expectError(
        () =>
          createReservation(
            'student-a',
            'ferda',
            d('10:10:00'),
            d('10:30:00'),
            NOW
          ),
        409
      );

      await resetDatabase();

      await insertReservation(
        'student-x',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      const reservation = await createReservation(
        'student-a',
        'ferda',
        d('10:10:00'),
        d('10:30:00'),
        NOW
      );

      assert(reservation.status === 'DRAFT', 'DRAFT nemá blokovat Create.');
    },
  },

  {
    id: 'V-05',
    name: 'Denní limit 20 + 10 projde, 20 + 11 neprojde',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-a',
        'ferda',
        d('09:00:00'),
        d('09:20:00'),
        'CONFIRMED'
      );

      const tenMinutes = await createReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:10:00'),
        NOW
      );

      assert(tenMinutes.status === 'DRAFT', '20 + 10 minut má být povoleno.');

      await expectError(() =>
        createReservation(
          'student-a',
          'ferda',
          d('11:00:00'),
          d('11:11:00'),
          NOW
        )
      );
    },
  },

  {
    id: 'V-06',
    name: 'Volný aktivní křeček je AVAILABLE',
    run: async () => {
      await resetDatabase();

      const result = await checkAvailability(
        'ferda',
        d('10:00:00'),
        d('10:30:00')
      );

      assert(result.available === true, 'Ferda má být dostupný.');
    },
  },

  {
    id: 'V-07',
    name: 'Překryv s CONFIRMED je UNAVAILABLE',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-x',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      const result = await checkAvailability(
        'ferda',
        d('10:10:00'),
        d('10:30:00')
      );

      assert(result.available === false, 'Ferda má být nedostupný.');
    },
  },

  {
    id: 'V-08',
    name: 'Dotyk hranic intervalů není kolize',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-x',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      const before = await checkAvailability(
        'ferda',
        d('09:40:00'),
        d('10:00:00')
      );

      const after = await checkAvailability(
        'ferda',
        d('10:20:00'),
        d('10:40:00')
      );

      assert(before.available === true, 'Interval před rezervací má být volný.');
      assert(after.available === true, 'Interval po rezervaci má být volný.');
    },
  },

  {
    id: 'V-09',
    name: 'DRAFT a CANCELLED dostupnost neblokují',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-x',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      await insertReservation(
        'student-y',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CANCELLED'
      );

      const result = await checkAvailability(
        'ferda',
        d('10:10:00'),
        d('10:30:00')
      );

      assert(result.available === true, 'DRAFT/CANCELLED nemají blokovat.');
    },
  },

  {
    id: 'V-10',
    name: 'Neaktivní křeček a neplatné Availability vstupy',
    run: async () => {
      await resetDatabase();

      const inactive = await checkAvailability(
        'spavek',
        d('10:00:00'),
        d('10:30:00')
      );

      assert(inactive.available === false, 'Neaktivní křeček má být UNAVAILABLE.');

      await expectError(
        () =>
          checkAvailability(
            'neexistuje',
            d('10:00:00'),
            d('10:30:00')
          ),
        404
      );

      await expectError(() =>
        checkAvailability(
          'ferda',
          d('10:00:00'),
          d('10:00:00')
        )
      );
    },
  },

  {
    id: 'V-11',
    name: 'Platný DRAFT přejde do CONFIRMED',
    run: async () => {
      await resetDatabase();

      const draft = await createReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        NOW
      );

      const result = await confirmReservation(
        draft.id,
        'student-a',
        NOW
      );

      assert(result.status === 'CONFIRMED', 'Očekáván CONFIRMED.');
      assert(
        (await notificationCount(draft.id)) === 1,
        'Má vzniknout právě jedna notifikace.'
      );
    },
  },

  {
    id: 'V-12',
    name: 'Kolize vzniklá po Create zabrání Confirm',
    run: async () => {
      await resetDatabase();

      const draftId = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      await insertReservation(
        'student-b',
        'ferda',
        d('10:10:00'),
        d('10:30:00'),
        'CONFIRMED'
      );

      await expectError(
        () => confirmReservation(draftId, 'student-a', NOW),
        409
      );

      assert(
        (await reservationStatus(draftId)) === 'DRAFT',
        'Po odmítnutí musí zůstat DRAFT.'
      );
    },
  },

  {
    id: 'V-13',
    name: 'Confirm znovu ověřuje denní limit',
    run: async () => {
      await resetDatabase();

      await insertReservation(
        'student-a',
        'ferda',
        d('09:00:00'),
        d('09:20:00'),
        'CONFIRMED'
      );

      const draftId = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:11:00'),
        'DRAFT'
      );

      await expectError(() =>
        confirmReservation(draftId, 'student-a', NOW)
      );

      assert(
        (await reservationStatus(draftId)) === 'DRAFT',
        'Rezervace musí zůstat DRAFT.'
      );
    },
  },

  {
    id: 'V-14',
    name: 'Souběžné konfliktní Confirm dovolí nejvýše jeden',
    run: async () => {
      await resetDatabase();

      const first = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      const second = await insertReservation(
        'student-b',
        'ferda',
        d('10:10:00'),
        d('10:30:00'),
        'DRAFT'
      );

      const results = await Promise.allSettled([
        confirmReservation(first, 'student-a', NOW),
        confirmReservation(second, 'student-b', NOW),
      ]);

      const successful = results.filter(
        result => result.status === 'fulfilled'
      ).length;

      assert(successful === 1, `Očekáván 1 úspěch, získáno ${successful}.`);

      const dbResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM reservations
         WHERE id IN ($1, $2)
           AND status = 'CONFIRMED'`,
        [first, second]
      );

      assert(
        dbResult.rows[0].count === 1,
        'V databázi smí být právě jedna CONFIRMED rezervace.'
      );
    },
  },

  {
    id: 'V-15',
    name: 'CONFIRMED/CANCELLED nelze znovu potvrdit',
    run: async () => {
      await resetDatabase();

      const confirmed = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      const cancelled = await insertReservation(
        'student-a',
        'ferda',
        d('11:00:00'),
        d('11:20:00'),
        'CANCELLED'
      );

      const before = await notificationCount();

      await expectError(() =>
        confirmReservation(confirmed, 'student-a', NOW)
      );

      await expectError(() =>
        confirmReservation(cancelled, 'student-a', NOW)
      );

      const after = await notificationCount();

      assert(before === after, 'Nemá vzniknout nová notifikace.');
    },
  },

  {
    id: 'V-15A',
    name: 'Pozdní Confirm je odmítnut',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      await expectError(() =>
        confirmReservation(
          id,
          'student-a',
          d('09:50:00')
        )
      );

      assert(
        (await reservationStatus(id)) === 'DRAFT',
        'Rezervace musí zůstat DRAFT.'
      );
    },
  },

  {
    id: 'V-15B',
    name: 'Selhání Notification Service při Confirm',
    run: async () => {
        await resetDatabase();

        setNotificationSender(async () => {
        throw new Error('Notification Service unavailable');
        });

        try {
        const draft = await createReservation(
            'student-a',
            'ferda',
            d('10:00:00'),
            d('10:20:00'),
            NOW
        );

        const result = await confirmReservation(
            draft.id,
            'student-a',
            NOW
        );

        assert(
            result.status === 'CONFIRMED',
            'Rezervace musí zůstat CONFIRMED.'
        );

        assert(
            !!result.warning,
            'Odpověď musí obsahovat warning.'
        );

        const notification = await pool.query(
            `SELECT status
            FROM notifications_outbox
            WHERE reservation_id = $1`,
            [draft.id]
        );

        assert(
            notification.rows.length === 1,
            'Musí existovat právě jedna notifikace.'
        );

        assert(
            notification.rows[0].status === 'FAILED',
            'Nedoručená notifikace musí mít stav FAILED.'
        );
        } finally {
        resetNotificationSender();
        }
    },
    },

  {
    id: 'V-16',
    name: 'Včasný Cancel DRAFT',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      const result = await cancelReservation(
        id,
        'student-a',
        NOW
      );

      assert(result.status === 'CANCELLED', 'Očekáván CANCELLED.');
      assert(
        (await notificationCount(id)) === 1,
        'Má vzniknout jedna notifikace.'
      );
    },
  },

  {
    id: 'V-17',
    name: 'Cancel CONFIRMED uvolní dostupnost',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      await cancelReservation(id, 'student-a', NOW);

      const availability = await checkAvailability(
        'ferda',
        d('10:00:00'),
        d('10:20:00')
      );

      assert(
        availability.available === true,
        'Po Cancel musí být interval dostupný.'
      );
    },
  },

  {
    id: 'V-18',
    name: 'Pozdní Cancel CONFIRMED je odmítnut',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      await expectError(() =>
        cancelReservation(
          id,
          'student-a',
          d('09:50:00')
        )
      );

      assert(
        (await reservationStatus(id)) === 'CONFIRMED',
        'Rezervace musí zůstat CONFIRMED.'
      );
    },
  },

  {
    id: 'V-19',
    name: 'Opakovaný Cancel je idempotentní',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      await cancelReservation(id, 'student-a', NOW);

      const before = await notificationCount(id);

      const second = await cancelReservation(
        id,
        'student-a',
        d('12:00:00')
      );

      const after = await notificationCount(id);

      assert(second.status === 'CANCELLED', 'Očekáván CANCELLED.');
      assert(second.idempotent === true, 'Očekáván idempotentní úspěch.');
      assert(before === after, 'Nesmí vzniknout další notifikace.');
    },
  },

  {
    id: 'V-20',
    name: 'Cizí student nemůže rezervaci zrušit',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
      );

      await expectError(
        () => cancelReservation(id, 'student-b', NOW),
        403
      );

      assert(
        (await reservationStatus(id)) === 'CONFIRMED',
        'Stav se nesmí změnit.'
      );
    },
  },

  {
    id: 'V-20A',
    name: 'Selhání Notification Service při Cancel',
    run: async () => {
        await resetDatabase();

        const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'CONFIRMED'
        );

        setNotificationSender(async () => {
        throw new Error('Notification Service unavailable');
        });

        try {
        const result = await cancelReservation(
            id,
            'student-a',
            NOW
        );

        assert(
            result.status === 'CANCELLED',
            'Rezervace musí zůstat CANCELLED.'
        );

        assert(
            !!result.warning,
            'Odpověď musí obsahovat warning.'
        );

        assert(
            (await reservationStatus(id)) === 'CANCELLED',
            'Stav rezervace musí zůstat CANCELLED.'
        );

        const notification = await pool.query(
            `SELECT status
            FROM notifications_outbox
            WHERE reservation_id = $1`,
            [id]
        );

        assert(
            notification.rows.length === 1,
            'Musí existovat právě jedna notifikace.'
        );

        assert(
            notification.rows[0].status === 'FAILED',
            'Nedoručená notifikace musí mít stav FAILED.'
        );
        } finally {
        resetNotificationSender();
        }
    },
    },

  {
    id: 'V-20B',
    name: 'Souběžný Confirm a Cancel stejného DRAFTu',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'ferda',
        d('10:00:00'),
        d('10:20:00'),
        'DRAFT'
      );

      const results = await Promise.allSettled([
        confirmReservation(id, 'student-a', NOW),
        cancelReservation(id, 'student-a', NOW),
      ]);

      const cancelResult = results[1];

      assert(
        cancelResult.status === 'fulfilled',
        'Cancel musí nakonec uspět.'
      );

      assert(
        (await reservationStatus(id)) === 'CANCELLED',
        'Konečný stav musí být CANCELLED.'
      );
    },
  },

  {
    id: 'V-21',
    name: 'Správce schválí PENDING_APPROVAL',
    run: async () => {
      await resetDatabase();

      const draft = await createReservation(
        'student-a',
        'archimedes',
        d('12:00:00'),
        d('12:20:00'),
        NOW
      );

      const pending = await confirmReservation(
        draft.id,
        'student-a',
        NOW
      );

      assert(
        pending.status === 'PENDING_APPROVAL',
        'Archimedes musí přejít do PENDING_APPROVAL.'
      );

      const result = await decideReservation(
        draft.id,
        'spravce',
        'APPROVE',
        d('10:00:00')
      );

      assert(result.status === 'CONFIRMED', 'Očekáván CONFIRMED.');
    },
  },

  {
    id: 'V-22',
    name: 'REJECT uvolní termín',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'archimedes',
        d('12:00:00'),
        d('12:20:00'),
        'PENDING_APPROVAL'
      );

      const result = await decideReservation(
        id,
        'manager',
        'REJECT',
        d('10:00:00')
      );

      assert(result.status === 'REJECTED', 'Očekáván REJECTED.');

      const availability = await checkAvailability(
        'archimedes',
        d('12:00:00'),
        d('12:20:00')
      );

      assert(
        availability.available === true,
        'Po REJECT musí být termín dostupný.'
      );
    },
  },

  {
    id: 'V-23',
    name: 'Student nesmí rozhodovat o PENDING_APPROVAL',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'archimedes',
        d('12:00:00'),
        d('12:20:00'),
        'PENDING_APPROVAL'
      );

      await expectError(
        () =>
          decideReservation(
            id,
            'student',
            'APPROVE',
            d('10:00:00')
          ),
        403
      );

      assert(
        (await reservationStatus(id)) === 'PENDING_APPROVAL',
        'Stav se nesmí změnit.'
      );
    },
  },

  {
    id: 'V-24',
    name: 'Nelze rozhodnout CANCELLED, EXPIRED ani CONFIRMED',
    run: async () => {
      await resetDatabase();

      for (const status of ['CANCELLED', 'EXPIRED', 'CONFIRMED']) {
        const id = await insertReservation(
          `student-${status}`,
          'archimedes',
          d('12:00:00'),
          d('12:20:00'),
          status
        );

        await expectError(() =>
          decideReservation(
            id,
            'spravce',
            'APPROVE',
            d('10:00:00')
          )
        );

        assert(
          (await reservationStatus(id)) === status,
          `Stav ${status} se nesmí změnit.`
        );
      }
    },
  },

  {
    id: 'V-25',
    name: 'PENDING_APPROVAL v start - 60 min expiruje',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'archimedes',
        d('12:00:00'),
        d('12:20:00'),
        'PENDING_APPROVAL'
      );

      const result = await expirePendingReservations(
        d('11:00:00')
      );

      assert(
        result.expiredIds.includes(id),
        'Rezervace měla být expirována.'
      );

      assert(
        (await reservationStatus(id)) === 'EXPIRED',
        'Očekáván stav EXPIRED.'
      );

      assert(
        (await notificationCount(id)) === 2,
        'Expirace má vytvořit notifikaci studentovi i správci.'
      );

      const availability = await checkAvailability(
        'archimedes',
        d('12:00:00'),
        d('12:20:00')
      );

      assert(
        availability.available === true,
        'Po expiraci má být křeček dostupný.'
      );
    },
  },

  {
    id: 'V-26',
    name: 'PENDING_APPROVAL dvě hodiny před začátkem neexpiruje',
    run: async () => {
      await resetDatabase();

      const id = await insertReservation(
        'student-a',
        'archimedes',
        d('12:00:00'),
        d('12:20:00'),
        'PENDING_APPROVAL'
      );

      const result = await expirePendingReservations(
        d('10:00:00')
      );

      assert(
        !result.expiredIds.includes(id),
        'Rezervace ještě neměla expirovat.'
      );

      assert(
        (await reservationStatus(id)) === 'PENDING_APPROVAL',
        'Rezervace musí zůstat PENDING_APPROVAL.'
      );
    },
  },
];

async function main(): Promise<void> {
  console.log('\n=== Křečkomat – ověření Specification Baseline ===\n');

  let passed = 0;
  let failed = 0;

  try {
    await initializeDatabase();

    for (const scenario of scenarios) {
      try {
        await scenario.run();

        passed++;
        console.log(`[PASS] ${scenario.id} – ${scenario.name}`);
      } catch (err) {

        failed++;

        const message =
          err instanceof Error
            ? err.message
            : JSON.stringify(err);

        console.error(
          `[FAIL] ${scenario.id} – ${scenario.name}: ${message}`
        );
      }
    }

    console.log('\n----------------------------------------');
    console.log(`PASS: ${passed}`);
    console.log(`FAIL: ${failed}`);
    console.log(`CELKEM: ${scenarios.length}`);
    console.log('----------------------------------------\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Verifier selhal:', err);
  process.exitCode = 1;
});