# 🐹 Křečkomat — Souhrnná dokumentace projektu

Kompletní technická a architektonická dokumentace univerzitního rezervačního systému školních antistresových křečků **Křečkomat** vytvořená v rámci předmětu Softwarové inženýrství (SWI).

---

## 📑 Obsah

1. [Přehled architektury a technologického stacku](#-přehled-architektury-a-technologického-stacku)
2. [C01 — Engineering Spike & Walking Skeleton](#-c01--engineering-spike--walking-skeleton)
3. [C02 — Specifikace požadavků & Základní operace (v0.1 a v0.2)](#-c02--specifikace-požadavků--základní-operace-v01-a-v02)
4. [C03 — Softwarová architektura (TO-BE) & Návrh](#-c03--softwarová-architektura-to-be--návrh)
5. [C05 — Detailed Design (DD) & Unit testy](#-c05--detailed-design-dd--unit-testy)
6. [Webové rozhraní (Frontend UX & Interaktivita)](#-webové-rozhraní-frontend-ux--interaktivita)
7. [Přehled verifikace a testovacích sad](#-přehled-verifikace-a-testovacích-sad)
8. [Struktura souborů v projektu](#-struktura-souborů-v-projektu)

---

## 🛠️ Přehled architektury a technologického stacku

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Klientská vrstva (Browser)                       │
│    Vanilla HTML5 / CSS3 (Design Tokens, Sticky Nav) / Modern JS ES6    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST API / JSON
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Web Controller Layer (src/app.ts)                     │
│           Express.js 5, CORS, x-current-time podpora pro testy         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│               Application & Domain Core Layer                          │
│   src/service.ts: Orchestrace transakcí, Outbox pattern, scheduler     │
│   src/domain.ts:  Čisté doménové invarianty, IConfirmationPolicy       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
┌───────────────────▼──────────────┐   ┌─────────────▼───────────────────┐
│  Persistence (src/repository.ts) │   │ Notification (src/notification) │
│  IReservationRepository contract │   │ Simulace externí e-mail služby  │
│  PostgresReservationRepository   │   │ Outbox tabulka s retry stavem   │
└───────────────────┬──────────────┘   └─────────────────────────────────┘
                    │ Connection Pool (SSL)
┌───────────────────▼────────────────────────────────────────────────────┐
│                    Cloud Database (PostgreSQL / Supabase)              │
│       Tabulky: hamsters, reservations, notifications_outbox            │
└────────────────────────────────────────────────────────────────────────┘
```

- **Runtime:** Node.js (TypeScript v5, spouštěno přes `tsx` ve vývoji, kompilace přes `tsc`).
- **Webový server:** Express.js 5 s podporou simulace časového posunu (`x-current-time` hlavička).
- **Databáze:** PostgreSQL běžící v cloudu (Supabase) s SSL šifrováním a transakční izolací.
- **Frontend:** Responzivní jednohodinový SPA frontend bez frameworkové režie v [public/index.html](public/index.html).

---

## 🚀 C01 — Engineering Spike & Walking Skeleton

### TL;DR
> Ověření technologické proveditelnosti (Node.js + PostgreSQL na cloudu) a vytvoření minimální spustitelné cesty aplikace (Walking Skeleton) pro vytvoření a načtení návrhu rezervace křečka.

### Detailní popis implementace

1. **Definice problému a rámce (Project Frame):**
   - Vytvořen studentský antistresový program umožňující studentům krátké 15–30minutové návštěvy u školních křečků v biologickém kabinetu.
   - Stanoveno klíčové doménové pravidlo: **max. 30 minut na studenta a křečka za jeden kalendářní den** v časovém pásmu `Europe/Prague` (`BR-04`).
2. **Technologický spike ([src/spike.ts](src/spike.ts)):**
   - Rychlé otestování síťového spojení s PostgreSQL na cloudu přes SSL (`pg.Pool`).
   - Automatická inicializace databázových tabulek (`hamsters`, `reservations`, `notifications_outbox`).
   - Vložení výchozích křečků do katalogu (*Ferda*, *Archimedes*, *Spávek*).
3. **End-to-end Walking Skeleton (CP1):**
   - Průchodná trasa: `POST /api/reservations` &rarr; validace vstupů &rarr; kontrola limitu &rarr; zápis do DB &rarr; návrat JSON s vygenerovaným ID rezervace ve stavu `DRAFT`.
   - Zpětné ověření přes `GET /api/reservations/:id`.
   - Dokumentováno v [docs/intent-and-change.md](docs/intent-and-change.md).

---

## 📋 C02 — Specifikace požadavků & Základní operace (v0.1 a v0.2)

### TL;DR
> Formalizace 4 základních operací systému (v0.1), definice doménových invariantů BR-01 až BR-07, rozšíření o schvalovací proces správce křečka (v0.2) a vytvoření integrační testovací sady o 30 scénářích.

### Detailní popis implementace

#### 1. Čtyři základní operace (v0.1)
Každá operace je formálně specifikována v [docs/reservation-specification.md](docs/reservation-specification.md):
- **OP-01 Create Reservation (`POST /api/reservations`):** Vytvoří nezávazný návrh (`DRAFT`). Provádí předběžné ověření dostupnosti a denního limitu, ale termín ještě neblokuje pro ostatní studenty.
- **OP-02 Check Availability (`GET /api/reservations/availability`):** Čistý dotaz bez vedlejších efektů. Zjišťuje, zda je křeček aktivní a zda v daném intervalu nekoliduje s jinou potvrzenou rezervací.
- **OP-03 Confirm Reservation (`POST /api/reservations/:id/confirm`):** Závazné potvrzení návrhu. Převádí rezervaci z `DRAFT` do `CONFIRMED`. Běží v transakci pod zámkem `SELECT ... FOR UPDATE` k eliminaci souběhu (race condition).
- **OP-04 Cancel Reservation (`POST /api/reservations/:id/cancel`):** Zrušení rezervace studentem. Lze provést nejpozději 15 minut před začátkem termínu. Uvolňuje blokovaný slot i vyčerpaný denní limit. Opakované volání je idempotentní.

#### 2. Baseline v0.2 — Schvalovací proces kustoda
- Zaveden křeček vyžadující zvýšený dohled (*Archimedes*).
- **OP-05 Decide Reservation (`POST /api/reservations/:id/decide`):** Správce křečka může žádost ve stavu `PENDING_APPROVAL` buď schválit (`APPROVE` &rarr; `CONFIRMED`), nebo zamítnout (`REJECT` &rarr; uvolnění slotu).
- **OP-06 Expire Reservation (`POST /api/reservations/expire`):** Pokud správce nerozhodne do 1 hodiny před začátkem (`currentTime >= start - 1h`), žádost automaticky expiruje (`EXPIRED`) a termín se uvolní.

#### 3. Doménové invarianty (`BR-01` až `BR-07`)
1. `BR-01`: Polouzavřené intervaly `[start, end)`. Dotyk hranic (např. 14:00–14:30 a 14:30–15:00) není kolize.
2. `BR-02`: Zákaz překryvu potvrzených rezervací téhož křečka.
3. `BR-03`: Časový předstih min. 15 minut před začátkem pro Create, Confirm i Cancel (`currentTime <= start - 15 min`).
4. `BR-04`: Denní limit 30 minut na studenta a křečka, striktně dělený přes půlnoc v pásmu `Europe/Prague`.
5. `BR-05`: Zpožděné schvalování křečků s příznakem `requires_approval = true`.
6. `BR-06`: Transactional Outbox pattern pro spolehlivé notifikace (selhání e-mailové služby nesmí shodit commit rezervace).
7. `BR-07`: Správce smí rozhodovat o žádosti pouze s předstihem větším než 1 hodina před začátkem.

#### 4. Diagramy a specifikace
- Use Case diagramy pro v0.1 i v0.2 v [DIAGRAMS.md](DIAGRAMS.md).
- Stavové diagramy životního cyklu rezervace (včetně přechodů `DRAFT` &rarr; `CONFIRMED` / `PENDING_APPROVAL` &rarr; `CANCELLED`, `REJECTED`, `EXPIRED`).
- Diagramy aktivit pro všechny operace se zvýrazněním transakčních mezí.

#### 5. Automatizované ověření baseline ([src/verify.ts](src/verify.ts))
- Sada 30 exaktních automatizovaných scénářů (`V-01` až `V-26`) využívající striktní `node:assert/strict`.
- Pokrývá úspěšné cesty, hraniční stavy, souběh, překročení limitů i selhání externí notifikace (`npm run verify` &rarr; **30 PASS / 0 FAIL**).

---

## 🏛️ C03 — Softwarová architektura (TO-BE) & Návrh

### TL;DR
> Definice architektonických driverů, vytvoření architektonického rozhodnutí ADR-01, oddělení raw SQL dotazů do samostatné vrstvy repozitáře (Repository Pattern), zprovoznění in-process časovače expirací a implementace automatického testu architektonických pravidel L2.

### Detailní popis implementace

#### 1. Architektonické drivery
V [docs/architecture-and-decisions.md](docs/architecture-and-decisions.md) byly formulovány 4 drivery podložené specifikací a evidencí:
1. **Concurrency & Exclusivity Driver (`BR-02`, `REQ-04`, `REQ-07`):** Eliminace dvojí rezervace pomocí řádkových zámků v PostgreSQL.
2. **Delayed Approval & Expiration Driver (`REQ-10`, `REQ-13`):** Správa asynchronního schvalování a garance expirace 1h před začátkem.
3. **Reliability & Transactional Outbox Driver (`REQ-06`, `BR-06`):** Odolnost vůči výpadkům externích systémů.
4. **Decoupling of Domain from Persistence Driver:** Izolace business logiky od konkrétního databázového driveru a SQL dialektu.

#### 2. ADR-01 — Umístění a vlastnictví delayed approval workflow a časovače expirací
- **Rozhodovací otázka:** Má být časovač expirací součástí hlavního aplikačního procesu (In-process), nebo má běžet jako samostatný worker proces?
- **Rozhodnutí:** Přijata **Alternativa A (In-process modul)** s neblokujícím časovačem uvnitř monolitického Node.js procesu. Důvodem je nulová provozní režie, atomické transakční záruky přes PostgreSQL a jednoduchost nasazení.

#### 3. Systémové a strukturální pohledy
- **C4 System Context diagram:** Vztahy mezi Studentem, Správcem, systémem Křečkomat a externí Notification Service.
- **TO-BE Component Diagram:** Komponenty s explicitním vlastnictvím stavů (`owns: Reservation lifecycle`, `owns: Database transaction boundary`, `owns: Outbox delivery state`).
- **Sekvenční diagram Confirm Reservation:** Detailní průběh potvrzení s větvením `alt` při kolizi či překročení limitu.
- **7 Cross-View kontrol:** Ověření souladu mezi use-case, komponentami, sekvencemi a deploymentem.

#### 4. Kódové změny a oddělení vrstev
- **Nová vrstva [src/repository.ts](src/repository.ts):** Definováno rozhraní `IReservationRepository` a implementace `PostgresReservationRepository`. Veškeré SQL dotazy (`SELECT ... FOR UPDATE`, `INSERT INTO reservations`, zápisy do outboxu) byly vyčleněny ze services.
- **Očištění kontroleru [src/app.ts](src/app.ts):** Odstraněn přímý import databázového `pool` i raw SQL dotazy; kontroler komunikuje pouze přes rozhraní služeb a repozitáře.
- **Automatický plánovač v [src/index.ts](src/index.ts):** Funkce `startExpiryScheduler()` spouští periodickou kontrolu expirací na pozadí s automatickým recovery po startu serveru (`runExpiryCheck()`).
- **Architektonický test [src/arch.test.ts](src/arch.test.ts):** Statická kontrola importů a kontraktů chránící L2 architekturu (`npm run test:arch` &rarr; **3 PASS**).

---

## 🔍 C05 — Detailed Design (DD) & Unit testy

### TL;DR
> Hloubkový návrh vybrané komponenty (Reservation Confirmation & Availability Policy) na úroveň tříd, metod a rozhraní IConfirmationPolicy. Zavedení rozhodovacího algoritmu a odvození 10 izolovaných in-memory unit testů.

### Detailní popis implementace

#### 1. Vymezení jednotky & 6 vnitřních odpovědností
Vybrána komponenta s nejbohatší doménovou logikou — `Reservation Confirmation & Availability Policy`:
- `DR-01: Validate Time Interval` — syntaktická validace `[start, end)`.
- `DR-02: Check Advance Lead Time` — kontrola předstihu 15 minut (`BR-03`).
- `DR-03: Assess Hamster Availability & Status` — ověření aktivity křečka.
- `DR-04: Detect Slot Collisions` — detekce překryvů polouzavřených intervalů (`BR-02`).
- `DR-05: Enforce Daily User Quota` — kontrola limitu 30 min rozpadlého přes půlnoc v `Europe/Prague` (`BR-04`).
- `DR-06: Resolve Target State & Outcome` — rozhodnutí stavu `CONFIRMED` vs `PENDING_APPROVAL` a sestavení výsledku.

#### 2. Návrh kontraktu a rozhraní ([src/domain.ts](src/domain.ts))
Zavedeno čisté doménové rozhraní bez jakýchkoli I/O závislostí:
```typescript
export interface IConfirmationPolicy {
  evaluate(
    candidate: ConfirmationCandidate,
    hamster: HamsterProfile,
    existingConfirmedIntervals: TimeInterval[],
    userDailyMinutes: Map<string, number>,
    currentTime: Date
  ): ConfirmationResult;
}
```
Výsledkem je diskriminovaný union `ConfirmationSuccess` (`ok: true`, `targetStatus`) nebo `ConfirmationFailure` (`ok: false`, kód chyby ze sad `INVALID_INTERVAL`, `LEAD_TIME_VIOLATION`, `HAMSTER_INACTIVE`, `INVALID_STATE`, `SLOT_CONFLICT`, `DAILY_LIMIT_EXCEEDED`).

#### 3. Rozhodovací algoritmus a prioritní vyhodnocovací strom
Algoritmus probíhá v deterministickém pořadí:
1. Validace syntaxe intervalu (`start < end`).
2. Kontrola předstihu alespoň 15 minut vůči referenčnímu času `currentTime`.
3. Kontrola aktivity křečka (`isActive = true`).
4. Kontrola výchozího stavu kandidáta (`status = 'DRAFT'`).
5. Průchod obsazenými sloty &rarr; detekce kolize.
6. Výpočet minut po kalendářních dnech &rarr; detekce překročení 30 min.
7. Větvení cílového stavu dle příznaku `requiresApproval`.

#### 4. Izolovaný unit test suite ([src/domain.test.ts](src/domain.test.ts))
10 odvozených unit testů spouštěných čistě v paměti (`npm run test:unit` &rarr; **10 PASS / 0 FAIL**, běh < 250 ms):
- `T-DD-01`: Neplatný interval (`start >= end`) okamžitě vrátí `INVALID_INTERVAL`.
- `T-DD-02`: Potvrzení 14 minut před začátkem vrátí `LEAD_TIME_VIOLATION`.
- `T-DD-03`: Neaktivní křeček (*Spávek*) vrátí `HAMSTER_INACTIVE`.
- `T-DD-04A` & `B`: Rozlišení přechodu do `CONFIRMED` (*Ferda*) a `PENDING_APPROVAL` (*Archimedes*).
- `T-DD-05A` & `B`: Překryv intervalů vrátí `SLOT_CONFLICT`, zatímco dotyk hranic (14:30) projde.
- `T-DD-06A` & `B`: Limit 20 + 15 min selže, rozpad intervalu přes půlnoc rozdělí minuty do dvou dnů v pražské časové zóně.
- `T-DD-07`: Zrušenou rezervaci (`CANCELLED`) nelze potvrdit (`INVALID_STATE`).

#### 5. Hloubková obhajoba testovací úrovně & evidence
- V [docs/evidence-and-evolution.md](docs/evidence-and-evolution.md) podrobně zdůvodněna volba unit úrovně pro testy `T-DD-02` (časový předstih jako čistá matematika bez závislosti na OS hodinách) a `T-DD-06B` (rozpad půlnoci v pásmu `Europe/Prague` bez režie databáze).
- Zpracována matice *Design ↔ Implementation consistency* potvrzující stoprocentní shodu kódu s návrhem.

---

## 🎨 Webové rozhraní (Frontend UX & Interaktivita)

Uživatelské rozhraní v [public/index.html](public/index.html) nabízí dvě plně funkční perspektivy:

```
┌────────────────────────────────────────────────────────────────────────┐
│ KŘEČKOMAT (UI)            [ Student: Tomáš ▼ ]   [ Student | Kabinet ] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   [ Ferda (Aktivní) ]      [ Archimedes (Dozor) ]       [ Spávek ]     │
│   ✓ Zvolen k rezervaci      Vyžaduje schválení          Odpočívá       │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ Rezervační panel — Ferda                                               │
│   Datum: [ 2027-10-02 ]   ( Dnes | Zítra | Pozítří )                   │
│   Čas:   [ 14:00 ]        ( 10:00 | 12:00 | 14:00 | 16:00 )            │
│   Délka: [ 30 minut ▼ ]                                                │
│                                                                        │
│   Denní limit: [████████████░░░░░░░░░░] 20 / 30 min                    │
│   Stav termínu: [OK] Termín je volný k rezervaci                       │
│                                                                        │
│   [ Uložit pouze jako návrh ]            [ Vytvořit a ihned potvrdit ] │
├────────────────────────────────────────────────────────────────────────┤
│ Harmonogram obsazenosti (Týdenní přehled Po - Ne)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Moje rezervace: [ Vše (3) | Potvrzené (1) | Čeká (1) | Návrhy (1) ]    │
└────────────────────────────────────────────────────────────────────────┘
```

### Hlavní prvky a provedené UX optimalizace:
1. **Interaktivní karty křečků:**
   - Celá plocha karty aktivního křečka je klikatelná (`cursor: pointer`). Kliknutím se křeček zvolí, vizuálně označí třídou `.selected` (terracotta rámeček, vnější záře, štítek `✓ Zvolen`), zosynchronizuje se s formulářem a plynule k němu odscrolluje.
   - Neaktivní křečci mají `cursor: not-allowed` a po kliknutí zobrazí vysvětlující toast zprávu.
   - Plná přístupnost pro klávesnici (`tabindex="0"`, aktivace klávesami Enter / Space).
2. **Korekce auto-scrollu pod sticky navigaci:**
   - Element `.booking-card` má definován `scroll-margin-top: 96px`, což kompenzuje výšku fixní horní lišty (72 px) s příjemnou rezervou (24 px). Nadpis sekce po kliknutí na kartu nezajíždí pod navigaci.
3. **Plynulé hover a aktivní stavy na všech ovládacích prvcích:**
   - Tlačítka (`.btn`): Zdvih `translateY(-1px)`, stínové akcenty a aktivní stlačení `translateY(0)` s filtrem jasu.
   - Výběrové čipy pro rychlá data a časy: `cursor: pointer` s jemným nadzvednutím.
   - Sloupce týdenního kalendáře (`.day-column`): hover zvýraznění terracotta rámečkem a stínem.
   - Taby filtrů a navigační logo: plynulé barevné přechody a rotace ikony křečka.
4. **Dvoufázový průchod:**
   - Možnost volby mezi uložením nezávazného návrhu (`DRAFT`) nebo okamžitým odesláním k potvrzení (`CONFIRMED` / `PENDING_APPROVAL`).
5. **Kabinet správce (Admin):**
   - Schvalovací fronta s okamžitým posouzením žádostí (`APPROVE` / `REJECT`), manuální spouštění expirací a přehled všech záznamů napříč studenty.

---

## 🧪 Přehled verifikace a testovacích sad

Systém disponuje třemi nezávislými vrstvami automatizovaného testování a jedním build checkem:

| Příkaz | Typ testu | Rozsah / Význam | Výsledek |
|---|---|---|:---:|
| `npm run test:unit` | **Unit testy (C05)** | 10 in-memory testů kontraktu `IConfirmationPolicy` a doménových invariantů | `10 PASS / 0 FAIL` |
| `npm run test:arch` | **Architektonické testy (C03)** | Statická kontrola oddělení vrstev L2 (Controller &rarr; Service &rarr; Repository &rarr; Domain) | `3 PASS / 0 FAIL` |
| `npm run verify` | **Integrační verifikace (C02)** | 30 scénářů Specification Baseline proti reálné PostgreSQL databázi na cloudu | `30 PASS / 0 FAIL` |
| `npm run build` | **Type check & Kompilace** | Striktní typová kontrola TypeScriptu do složky `dist/` | `0 chyb (OK)` |

---

## 📁 Struktura souborů v projektu

```
SWI_2027/
├── docs/                                  # Systémová a architektonická dokumentace
│   ├── intent-and-change.md              # Záměr projektu, doménová pravidla a walking skeleton
│   ├── reservation-specification.md      # Specifikace operací OP-01 až OP-06, matice požadavků
│   ├── architecture-and-decisions.md     # Architektura C03 (drivery, ADR-01, pohledy) a C05 (DD)
│   └── evidence-and-evolution.md         # Záznamy o testování, bězích a konzistenci návrhu
├── public/                                # Klientská prezentační vrstva
│   └── index.html                        # Webové rozhraní (Studentský pohled & Kabinet správce)
├── src/                                   # Zdrojový kód aplikačního jádra (TypeScript)
│   ├── domain.ts                         # Doménové invarianty, rozhraní IConfirmationPolicy
│   ├── domain.test.ts                    # Izolované unit testy Detailed Designu (C05)
│   ├── repository.ts                     # Perzistenční vrstva (IReservationRepository, SQL dotazy)
│   ├── service.ts                        # Aplikační služby, orchestrace transakcí a outboxu
│   ├── notification.ts                   # Abstrakce externí e-mailové služby (Transactional Outbox)
│   ├── app.ts                            # REST API kontrolery a Express middleware
│   ├── index.ts                          # Vstupní bod serveru a in-process plánovač expirací
│   ├── verify.ts                         # Integrační testovací sada Specification Baseline (C02)
│   ├── arch.test.ts                      # Automatický test architektonických pravidel (C03)
│   ├── db.ts                             # PostgreSQL connection pool konfigurace
│   └── spike.ts                          # Kód prvotního technologického ověření (C01)
├── DIAGRAMS.md                            # Use Case, stavové diagramy a diagramy aktivit (Mermaid)
├── Dokumentace.md                         # Tento souhrnný dokument
├── package.json                           # Závislosti a npm skripty
└── .env.example                           # Vzor konfigurace prostředí (bezpečné hodnoty)
```
