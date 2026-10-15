import dotenv from 'dotenv';
import { app } from './app';
import { initializeDatabase, expirePendingReservations } from './service';

dotenv.config();

const port = process.env.PORT || 3000;
const EXPIRY_CHECK_INTERVAL_MS = parseInt(
  process.env.EXPIRY_CHECK_INTERVAL_MS || '30000',
  10
);

let expiryTimer: NodeJS.Timeout | null = null;

export async function runExpiryCheck(): Promise<number> {
  try {
    const result = await expirePendingReservations();
    if (result.expiredCount > 0) {
      console.log(`⏰ Plánovač expirací: expirováno ${result.expiredCount} žádostí.`);
    }
    return result.expiredCount;
  } catch (err) {
    console.error('❌ Plánovač expirací selhal:', err);
    return 0;
  }
}

export function startExpiryScheduler(intervalMs = EXPIRY_CHECK_INTERVAL_MS): NodeJS.Timeout {
  if (expiryTimer) return expiryTimer;

  expiryTimer = setInterval(() => {
    void runExpiryCheck();
  }, intervalMs);

  expiryTimer.unref();
  return expiryTimer;
}

export function stopExpiryScheduler(): void {
  if (expiryTimer) {
    clearInterval(expiryTimer);
    expiryTimer = null;
  }
}

async function startServer() {
  try {
    console.log('🔄 Inicializuji databázové schéma a výchozí data...');
    await initializeDatabase();
    console.log('✅ Databáze připravena.');

    // ADR-01: Okamžitá kontrola při startu pro restart recovery a spuštění in-process plánovače
    await runExpiryCheck();
    startExpiryScheduler();
    console.log('⏰ In-process plánovač expirací aktivován.');

    app.listen(port, () => {
      console.log(`🚀 Křečkomat API server běží na http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Selhání při startu serveru / inicializaci DB:', err);
    process.exit(1);
  }
}

startServer();
