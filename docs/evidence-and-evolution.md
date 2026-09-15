# Evidence a evoluce (Evidence and Evolution)

Tento dokument mapuje vývoj projektu v čase, dosažené milníky a zhodnocení implementovaných řešení.

## C01 Engineering Spike

**Question / unknown:**
Dokážeme se úspěšně připojit k PostgreSQL databázi z našeho Node.js (TypeScript) prostředí, vytvořit tabulku pro rezervace křečka a uložit/načíst data pomocí knihovny `pg`?

**What we did:**
Vytvořili jsme skript `src/spike.ts` (spustitelný pomocí `npm run spike`), který se připojí k databázi přes nastavený pool (`src/db.ts`). Skript provede vytvoření tabulky `reservations` (pokud neexistuje), vloží testovací záznam rezervace (s uživatelem a časovým rozsahem) a okamžitě ho pomocí vráceného ID načte zpět z databáze a porovná data.

**Observed result:**
Skript úspěšně proběhl bez chyb. Tabulka byla vytvořena, data byla vložena a při zpětném načtení plně odpovídala tomu, co jsme vložili. Bylo potvrzeno, že spojení přes `pg` pool a použití `ts-node` s proměnnými prostředí (z `.env`) funguje spolehlivě.

**Decision / what changes because of the result:**
Rozhodli jsme se ponechat aktuální přístup k databázi (knihovna `pg` + připojení přes pool) jako výchozí bod pro další iterace. Víme nyní bezpečně, že ukládání funguje. V další fázi budeme moci na tento základ napojit Express API a reálné logiky.
