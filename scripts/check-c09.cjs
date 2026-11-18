const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const port = Number(process.argv[2]);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535,
  'Použijte npm run check:c09 -- PORT s portem izolované PostgreSQL.');

const env = {
  ...process.env,
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: String(port),
  DB_USER: 'swi_c08',
  DB_PASSWORD: '',
  DB_NAME: 'swi_c08_f1',
  DB_SSL: 'false',
  DOTENV_CONFIG_QUIET: 'true',
};
const npm = process.env.npm_execpath;
assert(npm, 'Spusťte kontrolu pomocí npm run check:c09.');

const commands = [
  // Ověření C08 nejprve zkontroluje, že cílová DB je vyhrazená a prázdná.
  ['--import', 'tsx', 'scripts/verify-c08-f1.cjs', String(port)],
  [npm, 'run', 'build'],
  [npm, 'test'],
  [npm, 'run', 'verify'],
  ['--import', 'tsx', 'src/decision-deadline.test.ts'],
];

for (const args of commands) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
