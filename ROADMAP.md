# Roadmap & Status — C02 a C03

Tento dokument shrnuje stav plnění požadavků cvičení C02 a kontrolního bodu CP1 podle zadání ([zadani.txt](zadani.txt)), hotové části, zbývající úkoly a navazující kroky.

---

## 1. Co už je hotovo

### A. Specifikace & Systémové pohledy
| Požadavek ze zadání C02 | Stav | Umístění / Dokument |
|---|:---:|---|
| **Čtyři základní operace (v0.1)** — Create, Check Availability, Confirm, Cancel popsané podle šablony | ✅ Hotovo | [docs/reservation-specification.md](docs/reservation-specification.md) (oddíl 1) |
| **Kontrola přijetí požadavků** — tabulkové hodnocení REQ-01 až REQ-09 (význam, proveditelnost, ověřitelnost, souběh) | ✅ Hotovo | [docs/reservation-specification.md](docs/reservation-specification.md) (oddíl 3) |
| **Společná doménová pravidla a invarianty** — definované pouze jednou (`BR-01` až `BR-07`) | ✅ Hotovo | [docs/reservation-specification.md](docs/reservation-specification.md) (oddíl 2) |
| **Diagram případů užití (Use Case)** — aktéři a cíle pro v0.1 i v0.2 | ✅ Hotovo | [DIAGRAMS.md](DIAGRAMS.md) (oddíly 1.1 a 2.2) |
| **Stavový diagram životního cyklu Reservation** — stavy v0.1 i v0.2 | ✅ Hotovo | [DIAGRAMS.md](DIAGRAMS.md) (oddíly 1.2 a 2.1) |
| **Diagramy aktivit** — OP-03 Confirm a OP-04 Cancel se znázorněním odpovědností a ochrany proti souběhu | ✅ Hotovo | [DIAGRAMS.md](DIAGRAMS.md) (oddíly 1.3 a 1.4) |
| **Vzájemná konzistence pohledů** — sjednocena časová pravidla (Create, Confirm a Cancel nejpozději 15 minut před začátkem; rozhodnutí Správce křečka pouze při `currentTime < start - 1h`; od `currentTime >= start - 1h` expirace), role Správce křečka a význam stavů | ✅ Hotovo | Všechny dokumenty vzájemně lícují |
| **Baseline v0.2 (Změna: Schvalovací proces)** — změnová karta, analýza dopadu, nová operace OP-05 (Approve/Reject) a OP-06 (Expire) | ✅ Hotovo | [docs/reservation-specification.md](docs/reservation-specification.md) (oddíl 4) a [DIAGRAMS.md](DIAGRAMS.md) (oddíl 2) |
| **Architektonické drivery pro C03** — souběh v transakcích, transactional outbox pro notifikace, plánovač expirací | ✅ Hotovo | [docs/evidence-and-evolution.md](docs/evidence-and-evolution.md) |

### B. Implementace aplikace (`src/`) — Dokončen Krok 1
Byla vytvořena plně funkční a zkompilovatelná implementace rezervačního systému v Node.js + Express + TypeScript napojená na PostgreSQL:

* **[src/domain.ts](src/domain.ts) — Doménová logika & Invarianty:**
  * Polouzavřené intervaly `[start, end)` (`BR-01`).
  * Časová podmínka podání nejpozději 15 minut před začátkem rezervace (`currentTime <= start - 15 min`).
  * Invariant zákazu překryvu potvrzených rezervací (`BR-02`).
  * Výpočet denního limitu 30 minut rozpadlého po půlnoci v pásmu `Europe/Prague` (`BR-04`).
* **[src/service.ts](src/service.ts) — Databázová vrstva & Transakce:**
  * Automatická inicializace schématu DB (`hamsters`, `reservations`, `notifications_outbox`).
  * Inicializace výchozích křečků: *Ferda* (běžný), *Archimedes* (vyžaduje schválení pro v0.2), *Spávek* (neaktivní pro negativní testy).
  * `createReservation` (OP-01) — vytvoření `DRAFT` s předběžnou kontrolou nekolize a limitu.
  * `checkAvailability` (OP-02) — čtecí dotaz bez vedlejších efektů na data.
  * `confirmReservation` (OP-03) — atomická transakce (`FOR UPDATE`) chránící před souběhem (`REQ-07`); větvení do `CONFIRMED` nebo `PENDING_APPROVAL`.
  * `cancelReservation` (OP-04) — storno před začátkem s idempotentním úspěchem při opakování.
  * `decideReservation` (OP-05) — rozhodnutí `APPROVE` / `REJECT` Správcem křečka.
  * `expirePendingReservations` (OP-06) — automatická expirace nerozhodnutých žádostí 1h před začátkem.
* **[src/notification.ts](src/notification.ts) — Abstrakce Notification Service:**
  * Odděluje pokus o doručení oznámení od business transakce.
  * Umožňuje deterministicky simulovat úspěch i selhání doručení.
  * Při selhání se již provedený business přechod nevrací zpět a outbox zpráva zůstává ve stavu `FAILED`.
* **[src/app.ts](src/app.ts) — REST API endpointy:**
  * `GET /api/hamsters` — katalog křečků.
  * `GET /api/reservations/availability` — ověření dostupnosti (OP-02).
  * `POST /api/reservations` — vytvoření DRAFT rezervace (OP-01).
  * `GET /api/reservations/:id` — čtení detailu rezervace (CP1 walking skeleton).
  * `POST /api/reservations/:id/confirm` — potvrzení rezervace (OP-03).
  * `POST /api/reservations/:id/cancel` — zrušení rezervace (OP-04).
  * `POST /api/reservations/:id/decide` — schválení / zamítnutí správcem křečka (OP-05).
  * `POST /api/reservations/expire` — expirace žádostí časovačem (OP-06).
  * Podpora hlavičky `x-current-time` pro deterministické testování časových hranic.
* **[public/index.html](public/index.html) — Moderní a přátelské uživatelské rozhraní:**
  * Příjemný a uklidňující vizuální styl (teplé pastelové barvy, písma *Outfit* a *Nunito*, karty křečků).
  * Vizuální přehled školních křečků s informací o aktivitě a nutnosti schválení.
  * Interaktivní formulář pro vytvoření nezávazného návrhu (DRAFT) a okamžité potvrzení.
  * Formulář pro zjištění okamžité dostupnosti křečka bez nutnosti rezervace.
  * Přehled vytvořených rezervací studenta s možností stornování termínu (v souladu s 15min pravidlem).
  * Panel Správce křečka pro posuzování žádostí (Approve / Reject) a spuštění kontroly expirace.
* **[src/index.ts](src/index.ts) — Vstupní bod:**
  * Start serveru s automatickou inicializací DB a ověřením spojení.
  * Úspěšný TypeScript build bez chyb (`npm run build`).
* **[src/verify.ts](src/verify.ts) — Automatizované ověření Specification Baseline:**
  * Integrační ověřovací skript běžící proti PostgreSQL.
  * Pokrývá všech 30 scénářů `V-01` až `V-26` včetně `V-15A`, `V-15B`, `V-20A` a `V-20B`.
  * Ověřuje časové hranice, stavové přechody, kolize, denní limit, souběh, schvalování, expiraci i selhání Notification Service.
  * Aktuální výsledek: `30 PASS`, `0 FAIL`.
  * Spuštění: `npm run verify`.


---

## 2. Stav ověřovací části C02

1. **Automatizované ověření Specification Baseline — ✅ Hotovo**
   - Implementován integrační ověřovací skript `src/verify.ts`.
   - Ověřeny všechny scénáře `V-01` až `V-26`, včetně `V-15A`, `V-15B`, `V-20A` a `V-20B`.
   - Ověření proběhlo proti PostgreSQL databázi.
   - Výsledek: `30 PASS`, `0 FAIL`.

2. **Evidence běhu — ✅ Hotovo**
   - Výsledek automatizovaného ověření byl zaznamenán do
     [docs/evidence-and-evolution.md](docs/evidence-and-evolution.md).

3. **Finální identifikace ověřené verze — ✅ Hotovo
   - Po vytvoření finálního commitu doplnit jeho hash do
     [docs/evidence-and-evolution.md](docs/evidence-and-evolution.md).

     
## 3. Akční plán dalších kroků

- [x] **Krok 1: Implementace API a logiky v `src/`**
  - [x] Vytvoření databázového schématu pro rezervace, křečky a outbox notifikace.
  - [x] Implementace validační logiky (časové pravidlo 15 minut předem, kontrola překryvu, denní limit 30 minut).
  - [x] Vystavení REST API endpointů v Express aplikaci.
  - [x] Ověření TypeScript překladu (`npm run build`).
- [x] **Krok 2: Vytvoření ověřovacího testovacího skriptu**
  - Implementace skriptu pokrývajícího klíčové testy ze specifikace (`V-01` až `V-26`).
  - Demonstrace všech stavových přechodů včetně schválení správcem a expirace.
- [x] **Krok 3: Spuštění, ověření a finalizace evidence**
  - Spuštění proti PostgreSQL databázi a ověření správných návratových kódů.
  - Doplnění finálního commitu do dokumentace pro uzavření C02.

## C03 — Architektura a rozhodnutí

### Část A — AS-IS analýza scénáře Confirm Reservation

- [x] A1 — výběr a reference scénáře
- [x] A2 — mapování hlavního průchodu na kód
- [x] A3 — alternativní / chybová větev
- [x] A4 — hlavní části implementace
- [x] A5 — stav, změna stavu a business invariant
- [x] A6 — relevantní závislosti
- [x] A7 — AS-IS strukturální diagram
- [ ] A8 — otázka pro další architektonický návrh

**Výstup:** `docs/architecture-and-decisions.md`

**Stav:** A1–A6 dokončeno. A7 má pracovní verzi a čeká na finální revizi.
A8 bude doplněno dalším členem týmu.