import assert from 'node:assert/strict';
import { pool } from './db';

async function runSpike() {
  console.log('--- Spouštím Engineering Spike: A — Persistence ---');
  
  try {
    // 1. Vytvoření tabulky, pokud neexistuje
    console.log('1. Vytvářím tabulku reservations (pokud neexistuje)...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        hamster_id VARCHAR(50) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(20) NOT NULL
      );
    `);
    
    // 2. Uložení testovací rezervace
    console.log('2. Ukládám testovací rezervaci do databáze...');
    const insertQuery = `
      INSERT INTO reservations (user_id, hamster_id, start_time, end_time, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;
    const reservation = {
      user_id: 'student_123',
      hamster_id: 'hamster_ferda',
      start_time: new Date('2027-10-01T10:00:00Z'),
      end_time: new Date('2027-10-01T10:30:00Z'),
      status: 'CONFIRMED',
    };
    const insertValues = [
      reservation.user_id,
      reservation.hamster_id,
      reservation.start_time,
      reservation.end_time,
      reservation.status,
    ];
    
    const insertResult = await pool.query(insertQuery, insertValues);
    assert.equal(insertResult.rows.length, 1, 'INSERT musí vrátit právě jedno ID.');
    const newReservationId = insertResult.rows[0].id;
    assert.ok(Number.isInteger(newReservationId), 'Databáze musí vrátit celočíselné ID rezervace.');
    console.log(`✅ Rezervace uložena s ID: ${newReservationId}`);

    // 3. Načtení uložené rezervace
    console.log('3. Načítám uloženou rezervaci zpět...');
    const selectQuery = 'SELECT * FROM reservations WHERE id = $1';
    const selectResult = await pool.query(selectQuery, [newReservationId]);
    const loadedReservation = selectResult.rows[0];
    
    // 4. Ověření a výpis
    console.log('4. Data načtená z databáze:');
    console.log(loadedReservation);
    
    assert.equal(selectResult.rows.length, 1, 'SELECT musí vrátit právě jednu rezervaci.');
    assert.deepStrictEqual(
      loadedReservation,
      { id: newReservationId, ...reservation },
      'Načtené ID, uživatel, křeček, časy a stav musí odpovídat uložené rezervaci.',
    );
    console.log('✅ Spike úspěšný: Načtená data odpovídají uloženým datům!');

  } finally {
    // Ukončení spojení
    await pool.end();
  }
}

runSpike().catch((error) => {
  console.error('❌ Chyba během běhu spike testu:', error);
  process.exitCode = 1;
});
