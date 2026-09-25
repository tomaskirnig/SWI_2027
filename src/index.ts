import dotenv from 'dotenv';
import { app } from './app';
import { initializeDatabase } from './service';

dotenv.config();

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🔄 Inicializuji databázové schéma a výchozí data...');
    await initializeDatabase();
    console.log('✅ Databáze připravena.');

    app.listen(port, () => {
      console.log(`🚀 Křečkomat API server běží na http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ Selhání při startu serveru / inicializaci DB:', err);
    process.exit(1);
  }
}

startServer();
