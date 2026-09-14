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
    const insertValues = [
      'student_123', 
      'hamster_ferda', 
      new Date('2027-10-01T10:00:00Z'), 
      new Date('2027-10-01T10:30:00Z'), 
      'CONFIRMED'
    ];
    
    const insertResult = await pool.query(insertQuery, insertValues);
    const newReservationId = insertResult.rows[0].id;
    console.log(`✅ Rezervace uložena s ID: ${newReservationId}`);

    // 3. Načtení uložené rezervace
    console.log('3. Načítám uloženou rezervaci zpět...');
    const selectQuery = 'SELECT * FROM reservations WHERE id = $1';
    const selectResult = await pool.query(selectQuery, [newReservationId]);
    const loadedReservation = selectResult.rows[0];
    
    // 4. Ověření a výpis
    console.log('4. Data načtená z databáze:');
    console.log(loadedReservation);
    
    if (loadedReservation.user_id === 'student_123' && loadedReservation.hamster_id === 'hamster_ferda') {
      console.log('✅ Spike úspěšný: Načtená data odpovídají uloženým datům!');
    } else {
      console.error('❌ Data neodpovídají!');
    }

  } catch (error) {
    console.error('❌ Chyba během běhu spike testu:', error);
  } finally {
    // Ukončení spojení
    await pool.end();
  }
}

runSpike();
