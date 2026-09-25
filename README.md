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

Tato end-to-end cesta (vytvoření rezervace křečka) bude první plně spustitelnou částí aplikace pro fázi CP1:

1. **`POST /api/reservations`** 
   - V těle požadavku přijde: `student_id`, `hamster_id` (např. "Ferda"), `start_time` a `end_time`.
2. **→ validate** 
   - Kontrola "Common rule": Ověříme v databázi, že Ferda v daný čas nemá jinou potvrzenou rezervaci.
   - Kontrola "Domain-specific rule": Ověříme, že požadovaný interval spolu s potvrzenými rezervacemi stejné dvojice `student_id` a `hamster_id` nepřekročí 30 minut v žádném kalendářním dni (`Europe/Prague`); přesná pravidla jsou v [Project Frame](docs/intent-and-change.md#domain-specific-business-rule).
3. **→ persist** 
   - Zápis nového záznamu o rezervaci ve stavu `DRAFT` do PostgreSQL tabulky `reservations`.
4. **→ return reservation ID**
   - Návrat HTTP statusu `201 Created` spolu s vygenerovaným ID rezervace v JSON odpovědi.
5. **→ automated check**
   - Automatický integrační test zavolá tuto cestu, získá ID a přes `GET /api/reservations/{id}` ověří uložená data a stav `DRAFT`.

Vytvoření návrhu ještě neblokuje čas křečka. Potvrzení bude samostatná operace, která znovu ověří dostupnost a denní limit a teprve potom změní stav na `CONFIRMED` a odešle oznámení přes Notification Service. Tato operace není součástí minimální cesty CP1 popsané výše.
