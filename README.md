# Křečkomat: Rezervační systém pro školního křečka 🐹

Tento projekt je vyvíjen v Node.js, Express, TypeScript a využívá PostgreSQL pro ukládání dat.

## Tým

Název týmu: **Křečkomat**

Členové:

- Martin Kalus
- Tomáš Kirnig
- Petr Gála
- Dennis Carnevale

Společný repozitář: [tomaskirnig/SWI_2027](https://github.com/tomaskirnig/SWI_2027).

## Struktura repozitáře

- `docs/` - Dokumentace projektu (specifikace C02, architektura, diagramy, evidence a rozhodnutí)
- `src/` - Backend aplikace v TypeScriptu (doménová logika, transakce, Express REST API)
- `public/` - Webový frontend aplikace (Warm Minimalist rozhraní pro studenty i správce)

## Požadavky

Pro spuštění projektu potřebujete mít:
- [Node.js](https://nodejs.org/) (ideálně LTS verzi v20+)
- PostgreSQL databázi (doporučeno: projekt na cloudovém [Supabase](https://supabase.com), případně lokální PostgreSQL)

## Instalace a nastavení

1. **Klonování repozitáře** (pokud ho ještě nemáte lokálně):
   ```bash
   git clone git@github.com:tomaskirnig/SWI_2027.git
   cd SWI_2027
   ```

2. **Instalace závislostí:**
   ```bash
   npm install
   ```

3. **Nastavení prostředí:**
   Po naklonování vytvořte v kořeni projektu soubor `.env` jako kopii `.env.example`. Pokud už vlastní `.env` máte, ponechte jej.

   PowerShell:
   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

   Linux / macOS:
   ```bash
   test -e .env || cp .env.example .env
   ```

   V `.env` nastavte `DATABASE_URL` (propojení na Supabase projekt s povoleným SSL):
   ```env
   DATABASE_URL=postgresql://postgres:[HESLO]@[HOST]:[PORT]/postgres
   PORT=3000
   ```
   Alternativně lze použít jednotlivé proměnné `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Soubor `.env` je ignorovaný Gitem; sdílená šablona `.env.example` obsahuje vzorové hodnoty.

4. **Příprava databáze na cloudu:**
   Veškerá data jsou **uložena na cloudu v Supabase PostgreSQL** (nikoliv lokálně). Do webového rozhraní Supabase nemusíte ručně naklikávat žádné tabulky ani spouštět SQL skripty — aplikace při svém prvním spuštění sama odešle do Supabase inicializační příkazy, které v cloudové databázi vytvoří potřebné tabulky (`hamsters`, `reservations`, `notifications_outbox`) a vloží výchozí křečky do katalogu.

## Spuštění a ovládání projektu

### NPM Skripty

Všechny klíčové příkazy jsou definovány v `package.json`:

| Příkaz | Význam |
|---|---|
| `npm run dev` | **Vývojový server** s automatickým sledováním změn a restartem (`tsx watch`). |
| `npm run build` | **Kompilace** TypeScriptu do složky `dist/` pomocí `tsc`. |
| `npm start` | **Produkční start** zkompilovaného serveru z `dist/index.js`. |
| `npm run spike` | **Engineering Spike (C01)** — rychlé ověření spojení s PostgreSQL a zápisu/čtení testovací rezervace. |
| `npm run verify` | **Automatizované ověření C02** — spustí 30 scénářů baseline a 7 regresních scénářů nad oddělenou PostgreSQL. |
| `npm run test:unit` | **Unit testy Detailed Designu (C05)** — 10 izolovaných unit testů v paměti ověřujících kontrakt `IConfirmationPolicy`. |
| `npm run test:arch` | **Architektonické testy (C03)** — statické ověření oddělení vrstev (4 kontroly: API a doména bez DB, kontrakt repository, služba bez SQL). |

Pro samostatný běh nových regresí použijte `npm run verify:regression`. Ověřovací sady mažou rezervace a outbox v nakonfigurované databázi; používejte pouze oddělenou testovací databázi.

Server standardně naslouchá na portu definovaném v `.env` (výchozí: `http://localhost:3000`).

---

## Webové uživatelské rozhraní (Frontend)

Po spuštění serveru otevřete v prohlížeči:
👉 **`http://localhost:3000`**

Aplikace nabízí dva plně funkční režimy přepínatelné v horní liště:
1. **🎓 Studentský pohled:**
   - Prohlížení katalogu křečků s jejich povahou a stavem.
   - **Týdenní harmonogram obsazenosti:** Zobrazení obsazených a volných časových slotů vybraného křečka s plynulým scrollováním při více rezervacích v jednom dni.
   - **Rezervační panel:** Výběr data a času s rychlými čipy, živá kontrola dostupnosti a vizuální ukazatel čerpání denního limitu (max. 30 minut denně).
   - Možnost dvoufázové rezervace: uložení jako `DRAFT` (návrh) nebo okamžité odeslání k potvrzení.
   - **Moje rezervace:** Přehled sjednaných termínů, potvrzení rozpracovaných návrhů a storno (s respektováním pravidla 15 minut předem a šetrným modálním dialogem).
2. **🧑‍🏫 Kabinet správce:**
   - Schvalovací fronta pro křečky vyžadující dohled (např. *Archimedes*).
   - Tlačítka pro schválení (`APPROVE`) nebo zamítnutí (`REJECT`) žádostí.
   - Ruční spuštění kontroly expirace nerozhodnutých žádostí (`OP-06`).
   - Přehled všech rezervací v celém systému napříč studenty.

---

## Přehled REST API endpointů

Pokud preferujete ovládání přes HTTP klienta (cURL, Postman, REST Client):

| Metoda | Endpoint | Operace / Význam | Parametry / Tělo požadavku |
|---|---|---|---|
| `GET` | `/api/hamsters` | Seznam křečků v katalogu | — |
| `GET` | `/api/reservations/availability` | **OP-02:** Ověření dostupnosti termínu | Query: `hamster_id`, `start_time`, `end_time` |
| `POST` | `/api/reservations` | **OP-01:** Vytvoření rezervace ve stavu `DRAFT` | Body: `{ user_id, hamster_id, start_time, end_time }` |
| `GET` | `/api/reservations` | Seznam existujících rezervací | Query: `user_id` (volitelné), `status` (volitelné) |
| `GET` | `/api/reservations/:id` | Detail konkrétní rezervace | URL: `:id` rezervace |
| `POST` | `/api/reservations/:id/confirm` | **OP-03:** Potvrzení rezervace (`CONFIRMED` / `PENDING_APPROVAL`) | Body: `{ user_id }` |
| `POST` | `/api/reservations/:id/cancel` | **OP-04:** Zrušení rezervace (nejpozději 15 min předem) | Body: `{ user_id }` |
| `POST` | `/api/reservations/:id/decide` | **OP-05:** Schválení / zamítnutí správcem | Header: `x-user-role: MANAGER` nebo `spravce`<br>Body: `{ decision: "APPROVE" \| "REJECT" }` |
| `POST` | `/api/reservations/expire` | **OP-06:** Spuštění časovače expirací | — |

> **Tip pro testování časových hranic:** Všechny endpointy podporují volitelnou HTTP hlavičku `x-current-time` (ve formátu ISO 8601, např. `2027-10-01T13:40:00Z`), což umožňuje deterministické testování pravidel jako je předstih 15 minut před začátkem rezervace.

---

## CP1 walking skeleton

Tato end-to-end cesta představuje minimální plně spustitelnou část aplikace pro fázi CP1:

1. **`POST /api/reservations`** 
   - V těle požadavku přijde: `user_id`, `hamster_id` (např. "Ferda"), `start_time` a `end_time`.
2. **→ validate** 
   - Kontrola "Common rule": Ověříme v databázi, že Ferda v daný čas nemá jinou potvrzenou rezervaci.
   - Kontrola "Domain-specific rule": Ověříme, že požadovaný interval spolu s potvrzenými rezervacemi stejné dvojice `user_id` a `hamster_id` nepřekročí 30 minut v žádném kalendářním dni (`Europe/Prague`); přesná pravidla jsou v [Project Frame](docs/intent-and-change.md#domain-specific-business-rule).
3. **→ persist** 
   - Zápis nového záznamu o rezervaci ve stavu `DRAFT` do PostgreSQL tabulky `reservations`.
4. **→ return reservation ID**
   - Návrat HTTP statusu `201 Created` spolu s vygenerovaným ID rezervace v JSON odpovědi.
5. **→ automated check**
   - Automatický integrační test zavolá tuto cestu, získá ID a přes `GET /api/reservations/{id}` ověří uložená data a stav `DRAFT`.

Vytvoření návrhu ještě neblokuje čas křečka. Potvrzení je samostatná
operace, která znovu ověří dostupnost a denní limit. U běžného křečka
provede přechod `DRAFT → CONFIRMED`; u křečka vyžadujícího schválení
provede přechod `DRAFT → PENDING_APPROVAL`.

Stav `PENDING_APPROVAL` dočasně blokuje křečka a čerpá denní limit,
dokud správce žádost neschválí, nezamítne, student ji nezruší nebo
nedojde k její expiraci.

## Aktuální rozsah prototypu

Confirm používá ConfirmationPolicy a repository.withTransaction. Automatická kontrola expirace běží při startu a standardně po 30 s (EXPIRY_CHECK_INTERVAL_MS); ruční endpoint je dostupný také. Výběr expirací je zamčený ve stejné transakci jako zápis stavu a outboxu.

NotificationSender je simulovaný. Confirm a nový Cancel provedou po COMMIT jeden pokus o předání, bez vrácení business změny při selhání. Oznámení správci a výsledky Decide/Expire se pouze uloží jako PENDING. Dispatcher ani automatické opakování nejsou součástí současné verze. Dotaz Availability je veřejný.

Ověření oprav z 22. 10. 2026 a identifikace pracovní verze: [evidence](docs/evidence-and-evolution.md#ověření-oprav-22-10-2026).

## Ověření lhůty Confirm pro C08

Spolužák provede [peer review návrhu CR-08](docs/review-c08.md) a výsledek uloží do [záznamu v kartě](docs/intent-and-change.md#záznam-peer-review).

[Záznam obou scénářů C08](docs/evidence-and-evolution.md#c08--ověření-f1-na-výchozí-verzi) vychází z commitu `c39d54feda198c78c1b330ce3008f2eb6e83ae97`. Pro opakování reprodukce spusťte příkazy z kořene checkoutu tohoto commitu nebo z kořene rozbaleného balíčku C08 (adresář `Kreckomat-C08` s `package.json`). Pokud skript v cílovém checkoutu ještě není, použijte jeho absolutní cestu z checkoutu s dokumentací C08. Pro ověření opravy použijte stejný skript nad výsledným commitem z C09.

Prostředí evidovaného běhu bylo Windows, Node.js 22.14.0, závislosti z `package-lock.json` a PostgreSQL 17.11. Potřebujete nástroje `initdb`, `pg_ctl` a `createdb` na PATH. Následující PowerShell postup vytvoří novou testovací instanci s přístupem pouze přes loopback a bez hesla. Použijte volný port. Skript očekává prázdnou testovací DB `swi_c08_f1` a roli `swi_c08`. Schéma připraví inicializace aplikace.

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "Instalace závislostí selhala." }
$c08Data = Join-Path $env:TEMP ("swi-c08-" + [guid]::NewGuid().ToString("N"))
$c08Port = 55015
initdb -D $c08Data -U swi_c08 --auth=trust --encoding=UTF8 --no-locale
if ($LASTEXITCODE -ne 0) { throw "Inicializace testovací DB selhala." }
pg_ctl -D $c08Data -l "$c08Data/server.log" -o "-h 127.0.0.1 -p $c08Port" -w start
if ($LASTEXITCODE -ne 0) { throw "Start testovací DB selhal." }
try {
    createdb -h 127.0.0.1 -p $c08Port -U swi_c08 swi_c08_f1
    if ($LASTEXITCODE -ne 0) { throw "Vytvoření testovací DB selhalo." }
    node --import tsx ./scripts/verify-c08-f1.cjs $c08Port
    $c08Exit = $LASTEXITCODE
} finally {
    pg_ctl -D $c08Data -m fast -w stop
}
$c08Exit
```

Výstup uvádí pro každý případ HTTP odpověď, skutečné čekání v PostgreSQL a stav rezervace a outboxu po dokončení. Návratový kód čtěte spolu s vypsanými `caseId` a `verdict`. Kód `0` s dvěma výsledky `PASS` znamená dva průchody. Kód `1` s výsledkem `FAIL` znamená nesoulad. Na výchozí verzi očekávejte `TC-C08-01 PASS` a `TC-C08-02 FAIL`, protože druhý případ reprodukuje F1. Kód `2` nebo ukončení před vypsáním některého verdiktu je překážka při provedení. Do evidence uveďte příčinu a případ bez verdiktu označte `BLOCKED`. Každé opakování použije novou prázdnou testovací DB.
