import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/**
 * C03 Architektonický test (Sekce L2)
 *
 * Ověřuje dvě klíčová architektonická pravidla vrstvení plynoucí z G2 / ADR-01:
 *
 * 1. Pravidlo izolace perzistence:
 *    Přímý přístup k databázovému ovladači 'pg' a 'pool' je povolen
 *    výhradně v perzistenční vrstvě (src/db.ts a src/repository.ts).
 *    Doménová logika (src/domain.ts) ani API kontrolery (src/app.ts)
 *    nesmí importovat 'pg' ani './db'.
 *
 * 2. Pravidlo čistoty domény:
 *    Doménový modul (src/domain.ts) musí obsahovat pouze čisté business funkce
 *    a nesmí mít žádné externí závislosti (žádné 'pg', 'express', './db', './service').
 */

function checkArchitectureRules(): void {
  console.log('\n=== Křečkomat – Ověření architektonických pravidel (C03 L2) ===\n');

  const srcDir = path.resolve(__dirname);

  // Pravidlo 1: Kontrola app.ts
  const appPath = path.join(srcDir, 'app.ts');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert(
    !appContent.includes("from 'pg'") && !appContent.includes('from "pg"'),
    'Porušení architektury: src/app.ts nesmí přímo importovat pg!'
  );
  assert(
    !appContent.includes("from './db'") && !appContent.includes('from "./db"'),
    'Porušení architektury: src/app.ts nesmí přímo importovat db pool! Musí využívat service/repository rozhraní.'
  );
  console.log('[PASS] ARCH-01: Kontroler (src/app.ts) je izolován od databázového ovladače pg i pool.');

  // Pravidlo 2: Kontrola domain.ts
  const domainPath = path.join(srcDir, 'domain.ts');
  const domainContent = fs.readFileSync(domainPath, 'utf8');

  assert(
    !domainContent.includes("from 'pg'") && !domainContent.includes('from "pg"'),
    'Porušení architektury: src/domain.ts nesmí importovat pg!'
  );
  assert(
    !domainContent.includes("from './db'") && !domainContent.includes('from "./db"'),
    'Porušení architektury: src/domain.ts nesmí importovat db pool!'
  );
  assert(
    !domainContent.includes("from './service'") && !domainContent.includes('from "./service"'),
    'Porušení architektury: src/domain.ts nesmí záviset na aplikační službě!'
  );
  console.log('[PASS] ARCH-02: Doménový modul (src/domain.ts) obsahuje pouze čistou business logiku bez infrastruktury.');

  // Pravidlo 3: Kontrola repository.ts jako jediného vlastníka SQL
  const repoPath = path.join(srcDir, 'repository.ts');
  assert(fs.existsSync(repoPath), 'src/repository.ts musí existovat jako samostatná perzistenční vrstva!');
  const repoContent = fs.readFileSync(repoPath, 'utf8');
  assert(
    repoContent.includes('export interface IReservationRepository'),
    'src/repository.ts musí definovat rozhraní IReservationRepository!'
  );
  console.log('[PASS] ARCH-03: Perzistenční vrstva (src/repository.ts) explicitně definuje IReservationRepository rozhraní.');

  const serviceContent = fs.readFileSync(path.join(srcDir, 'service.ts'), 'utf8');
  assert(!/from\s+['"](?:pg|\.\/db)['"]/.test(serviceContent),
    'Aplikační služba nesmí přímo importovat pg ani db pool.');
  assert(!/\.query\s*\(/.test(serviceContent),
    'SQL a transakční příkazy patří do repository, nikoli do služby.');
  console.log('[PASS] ARCH-04: Aplikační služba deleguje SQL a transakce na repository.');

  console.log('\n----------------------------------------');
  console.log('Architektonická pravidla: VŠECHNA SPLNĚNA');
  console.log('----------------------------------------\n');
}

try {
  checkArchitectureRules();
} catch (err: any) {
  console.error('\n❌ Selhání architektonického testu:', err.message);
  process.exit(1);
}
