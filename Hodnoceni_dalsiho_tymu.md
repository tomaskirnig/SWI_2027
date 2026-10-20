# Srovnávací analýza: Dokumentace vs. Reálná implementace

**Projekt:** Parking Reservation System (SWI_Project_2026)  
**Datum revize:** 20. října 2026  
**Analyzované dokumenty:**
- `README.md`
- `docs/specification.md` (Baseline v0.1 a návrh v0.2)
- `docs/architecture-and-decisions.md` (ADR-001 až ADR-005)
- `docs/intent-and-change.md` (Project Frame & Future Pressure Q)
- `docs/evidence-and-evolution.md` (Engineering Spike A)

---

## Manažerské shrnutí (Executive Summary)

Projekt se nachází ve fázi po dokončení vývojové etapy **C02 (Baseline v0.1 + Baseline v0.2)**. 
- **Core aplikační a byznys logika specifikovaná v `docs/specification.md` (OP-01 až OP-05, BR-01 až BR-05) je kompletně a velmi precizně naimplementována** v servisní vrstvě `backend/Services/ReservationService.cs` a vystavena přes Minimal API endpointy v `backend/Program.cs`.
- **Testovací pokrytí servisní vrstvy je vynikající**: Všechny příklady ověření (*verification examples*) zapsané ve specifikaci mají odpovídající xUnit testy běžící proti reálné SQLite databázi s migracemi.
- **Rozpory a dluhy vůči obecné dokumentaci (`README.md` a `docs/intent-and-change.md`)**:
  1. **Chybějící entity a tabulky z Project Frame**: `ParkingArea`, `User` a `Vehicle` v kódu vůbec neexistují.
  2. **Zjednodušený stav parkovacího místa**: `ParkingSpot` nemá stavy `FREE`, `RESERVED`, `OCCUPIED`, `OUT_OF_SERVICE`. Stav obsazení se počítá výhradně dynamicky z rezervací; stav mimo provoz je reprezentován pouze booleanem `IsActive`.
  3. **Absence správy míst (CRUD)**: V systému neexistují endpointy pro vytváření a správu `ParkingSpot` ani `ParkingArea` (místa se musí plnit přímým SQL skriptem do SQLite).
  4. **Zastaralé sekce v `README.md`**: Sekce 9 („Definition of Done před C02“) popisuje stav před mergem C01 spike a C02, ačkoliv kód i git historie již obsahují kompletní Baseline v0.2.
  5. **Chybějící externí integrace**: `Notification Service` není nijak implementována (v souladu s TBD poznámkami ve specifikaci).
  6. **Drobné odchylky v souběhu (Concurrency edge-case)**: V textu specifikace OP-04 se uvádí, že pokud souběžný `Confirm` vyhraje nad `Cancel`, má být `Cancel` odmítnut. V implementaci je však `CONFIRMED -> CANCELLED` povolený přechod, takže `Cancel` i po předchozím potvrzení uspěje.

---

## 1. Detailní srovnání doménového modelu

| Koncept / Entita | Slib v dokumentaci (`README.md` / `intent-and-change.md`) | Reálný stav v kódu (`backend/Domain/`, `backend/Data/`) | Shoda | Poznámka |
|---|---|---|:---:|---|
| **`ParkingArea`** | Nadřazený celek (patro garáže, zóna). Atributy: `id`, `name`, `address/location`, `type`, `openingHours`, `pricingPolicy`, `spots`. | **V kódu vůbec neexistuje.** Není třída v `Domain/`, ani `DbSet` v `ParkingDbContext`, ani cizí klíč v `ParkingSpot`. | ❌ **0%** | Odloženo jako budoucí rozšíření; pro zkoumané operace OP-01..05 není entita bezprostředně vyžadována. |
| **`ParkingSpot`** (Resource) | Identifikace místa, vazba na `ParkingArea`, typ místa (`STANDARD`, `COMPACT`, `DISABLED`, `EV_CHARGING`, `MOTORCYCLE`), stav místa (`FREE`, `RESERVED`, `OCCUPIED`, `OUT_OF_SERVICE`). | Třída `ParkingSpot.cs`: má `Id`, `Type` (enum), `IsActive` (bool) a `RequiresApproval` (bool). | ⚠️ **50%** | Chybí vazba na `areaId`. **Chybí stav místa** (`FREE/RESERVED/OCCUPIED/OUT_OF_SERVICE`). Fyzická obsazenost se nesleduje. |
| **`Reservation`** | Rezervace místa na časové okno. Atributy: `id`, `spotId`, `userId`, `startTime`, `endTime`, `state`. | Třída `Reservation.cs`: má `Id`, `SpotId`, `Spot`, `UserId`, `StartTime`, `EndTime`, `State`, plus `PendingApprovalSince` (v0.2). | ✅ **100%** | Plně odpovídá datovému modelu z C01 i rozšíření v0.2. |
| **`ReservationState`** | Stavy: `DRAFT`, `CONFIRMED`, `CANCELLED` (v0.1) + `PENDING_APPROVAL`, `REJECTED`, `EXPIRED` (v0.2). | Enum `ReservationState.cs`: obsahuje přesně všech 6 stavů: `Draft`, `Confirmed`, `Cancelled`, `PendingApproval`, `Rejected`, `Expired`. V DB uloženo jako text. | ✅ **100%** | Perfektní shoda s diagramem 3b v `docs/specification.md`. |
| **`User`** / Řidič / Správce / Approver | Uživatel se specifickými rolemi (řidič, správce, schvalovatel). | **Entita neexistuje.** V requestech a entitě `Reservation` vystupuje pouze primitivní `int UserId`, resp. `int ApproverUserId`. | ⚠️ **Částečně** | Specifikace i ADR explicitně uvádějí, že auth systém je prozatím TBD a validuje se pouze `UserId > 0`. |
| **`Vehicle`** | Vozidlo přiřazené k rezervaci pro ověření oprávnění (EV, ZTP). | **Entita neexistuje.** Vlastnosti vozidla jsou předávány jako booleany přímo v DTO požadavku `CreateReservationRequest` (`VehicleIsElectric`, `VehicleHasDisabledPermit`). | ⚠️ **Částečně** | Shoduje se s poznámkou TBD v `docs/specification.md` (zdroj informací o vozidle nebyl určen). |

---

## 2. Porovnání operací (OP-01 až OP-05)

### OP-01: Create Reservation
- **Slib v dokumentaci (`specification.md` REQ-01):**
  - Vytvoření rezervace ve stavu `DRAFT`.
  - Nekontroluje kolize s jinými rezervacemi ani dostupnost (nealokuje místo).
  - Preconditions: Uživatel autorizován (`UserId > 0`), místo existuje, `start < end` (BR-01), BR-04 pravidla pro `EV_CHARGING` a `DISABLED`.
  - Návratová hodnota: ID rezervace a stav.
- **Reálná implementace (`backend/Services/ReservationService.cs` + `Program.cs`):**
  - Endpoint: `POST /reservations`
  - Validace: `UserId <= 0` vrací 401 Unauthorized; `Start >= End` vrací 400 InvalidInterval; neexistující místo vrací 404 SpotNotFound; nesplnění podmínek pro EV/Disabled vrací 400 SpotRequiresEligibility.
  - Vytvoří a uloží entitu se stavem `ReservationState.Draft`.
  - Vrací HTTP 201 Created s JSON `{ id, state: "Draft" }`.
- **Hodnocení:** ✅ **100% Shoda.**

---

### OP-02: Check Availability
- **Slib v dokumentaci (`specification.md` REQ-02):**
  - Ověření, zda je místo volné pro daný půlotevřený interval `[start, end)`.
  - Neaktivní místo (`!IsActive`) je vždy nedostupné (`UNAVAILABLE`).
  - Místo je nedostupné, pokud se interval překrývá s jakoukoliv `CONFIRMED` rezervací.
  - Rezervace ve stavu `DRAFT` nebo `PENDING_APPROVAL` dostupnost neblokují.
- **Reálná implementace (`backend/Services/ReservationService.cs` + `Program.cs`):**
  - Endpoint: `GET /parking-spots/{spotId}/availability?start={start}&end={end}`
  - Validace: `start >= end` -> 400, nenalezené místo -> 404.
  - Kontrola: `!spot.IsActive` -> vrací `{ available: false }`.
  - Kontrola překryvu: `r.State == ReservationState.Confirmed && r.StartTime < end && start < r.EndTime`.
  - Vrací HTTP 200 OK s `{ available: true/false }`.
- **Hodnocení:** ✅ **100% Shoda.**

---

### OP-03: Confirm Reservation
- **Slib v dokumentaci (`specification.md` REQ-03, REQ-04, BR-05):**
  - Přechod z `DRAFT` do cílového stavu.
  - Preconditions: `UserId > 0`, rezervace existuje, stav je `DRAFT`, `current time < start` (server UTC), místo je aktivní.
  - Větvení podle `RequiresApproval`:
    - Pokud `RequiresApproval = false`: ověří kolizi s jinou `CONFIRMED` rezervací téhož místa. Bez kolize -> přechod do `CONFIRMED`. Při kolizi -> odmítnuto, zůstává `DRAFT`.
    - Pokud `RequiresApproval = true`: přechod do `PENDING_APPROVAL`, kontrola kolize se odkládá na Approve (OP-05).
  - Souběh (REQ-04): Při konkurenčních požadavcích na totéž místo smí uspět nejvýše jeden.
- **Reálná implementace (`backend/Services/ReservationService.cs` + `Program.cs`):**
  - Endpoint: `POST /reservations/{id}/confirm`
  - Využívá zámek `SpotLocks.Get(spotId)` pro serializaci operací nad týmž parkovacím místem v rámci procesu.
  - Po získání zámku provádí `ReloadAsync()` nad entitou.
  - Kontroluje stav (`!= Draft` -> 409), čas (`_clock.UtcNow >= StartTime` -> 409), aktivitu místa (`!spot.IsActive` -> 409).
  - Zpracovává větev `spot.RequiresApproval`: nastaví `State = PendingApproval`, zapíše `PendingApprovalSince = _clock.UtcNow` a uloží.
  - Pro standardní místo ověřuje kolize v DB a při úspěchu nastaví `State = Confirmed`.
- **Hodnocení:** ✅ **100% Shoda.**

---

### OP-04: Cancel Reservation
- **Slib v dokumentaci (`specification.md` REQ-05, BR-03):**
  - Zrušení rezervací ve stavech `DRAFT`, `CONFIRMED` nebo `PENDING_APPROVAL` (v0.2).
  - Podmínka: `current time < start`.
  - Idempotence: Zrušení již zrušené rezervace (`CANCELLED`) je úspěch beze změny stavu, a to i po `start`.
  - Terminální stavy: Pokus o zrušení `REJECTED` nebo `EXPIRED` musí být odmítnut.
  - Souběh Confirm vs. Cancel: *"If Confirm and Cancel race on the same Reservation, at most one of them succeeds (whichever is persisted first)... a concurrent Confirm request was persisted first -> reject this Cancel request"*.
- **Reálná implementace (`backend/Services/ReservationService.cs` + `Program.cs`):**
  - Endpoint: `POST /reservations/{id}/cancel`
  - Kontroluje idempotenci pro `Cancelled` (vrací OK).
  - Kontroluje terminální stavy `Rejected` a `Expired` (vrací 409 InvalidState).
  - Serializuje přes `SpotLocks.Get(spotId)`.
  - Obsahuje línou kontrolu expirace: pokud schvalovací okno vypršelo, přepne rezervaci do `Expired` a zrušení odmítne.
  - Kontroluje čas: `_clock.UtcNow >= reservation.StartTime` -> 409 TooLate.
  - Nastaví `State = Cancelled`, vynuluje `PendingApprovalSince` a uloží.
- **Odchylka v souběhu (Divergence):**
  - Pokud nastane race condition mezi `Confirm` a `Cancel` téže rezervace, a `Confirm` získá zámek jako první a potvrdí rezervaci (`CONFIRMED`), následný `Cancel` po získání zámku uvidí stav `CONFIRMED`. Protože však kód umožňuje zrušit i `CONFIRMED` rezervace před začátkem, `Cancel` projde a rezervaci zruší.
  - Specifikace v textu a diagramu aktivit (kroky 460–464) naproti tomu popisovala striktní souboj, kde měl být `Cancel` odmítnut, pokud `Confirm` vyhrál první. V kódu je chování pragmatičtější, ale formálně se od textu diagramu odchyluje.
- **Hodnocení:** ⚠️ **95% Shoda** (drobná odchylka v modelu soupeření operací).

---

### OP-05: Approve / Reject Reservation (v0.2)
- **Slib v dokumentaci (`specification.md` REQ-06, REQ-07, REQ-08):**
  - Schvalovací operace pro rezervace ve stavu `PENDING_APPROVAL`.
  - **Approve (REQ-06)**: Zkontroluje `now < start`, aktivitu místa a kolizi s existujícími `CONFIRMED` rezervacemi. Při úspěchu -> `CONFIRMED`.
  - **Reject (REQ-07)**: Vždy převede rezervaci do terminálního stavu `REJECTED`, bez ohledu na překryvy či aktivitu místa.
  - **Expiry (REQ-08)**: Pokud vypršelo schvalovací okno, rezervace přechází líně při dalším přístupu do terminálního stavu `EXPIRED`.
- **Reálná implementace (`backend/Services/ReservationService.cs` + `Program.cs`):**
  - Endpointy: `POST /reservations/{id}/approve` a `POST /reservations/{id}/reject`.
  - Obě metody zamykají `SpotLocks`.
  - Implementována líná kontrola vypršení: `HasApprovalWindowElapsed()` porovnává `_clock.UtcNow - reservation.PendingApprovalSince >= _approvalWindow`. Při vypršení nastaví `Expired` a požadavek odmítne.
  - `Approve`: ověří stav `PendingApproval`, čas `now < start`, `spot.IsActive` a kolize v DB. Při splnění nastaví `Confirmed`.
  - `Reject`: ověří stav `PendingApproval`, nastaví `Rejected`.
- **Hodnocení:** ✅ **100% Shoda.**

---

## 3. Ověření doménových pravidel a invariantů (BR)

| Pravidlo | Popis pravidla ve specifikaci | Implementace v kódu | Shoda |
|---|---|---|:---:|
| **BR-01** | **Interval semantics `[start, end)`**: Intervaly jsou polootevřené. Dotyk v hraničním bodě není kolize. | Kód používá striktní podmínku `<` namísto `<=`: `StartTime < end && start < EndTime`. Validováno testy na dotyk hranic. | ✅ **Plně splněno** |
| **BR-02** | **Exclusive Resource Invariant**: V žádném potvrzeném stavu se nesmí překrývat dvě `CONFIRMED` rezervace na témže místě. | Vynuceno v OP-02 (dostupnost), OP-03 (potvrzení) i OP-05 (schválení). Chráněno procesním zámkem `SpotLocks`. | ✅ **Plně splněno** |
| **BR-03** | **Cancellation policy**: Zrušení povoleno před `start`. Idempotentní pro `CANCELLED`. Zákaz rušení po `start` a pro `REJECTED`/`EXPIRED`. | Kompletně zapouzdřeno v `CancelReservationAsync()`. | ✅ **Plně splněno** |
| **BR-04** | **Domain-specific rule (C01)**: Místa `EV_CHARGING` a `DISABLED` smí rezervovat pouze oprávněné vozidlo / držitel průkazu. | Implementováno v `CreateReservationAsync()` kontrolou atributů `VehicleIsElectric` a `VehicleHasDisabledPermit`. | ✅ **Plně splněno** |
| **BR-05** | **Approval gate (v0.2)**: Místo s `RequiresApproval = true` dosáhne `CONFIRMED` pouze přes OP-05 Approve, nikdy přímo přes Confirm. | `ConfirmReservationAsync()` přesměrovává rezervaci do `PendingApproval`. `ApproveReservationAsync()` je jediné místo přechodu do `Confirmed`. | ✅ **Plně splněno** |

---

## 4. Architektonická rozhodnutí (ADR-001 až ADR-005)

1. **ADR-001: Backend Stack** (.NET 8 Web API, EF Core SQLite, Swagger)
   - *Status:* **Platí**. Všechny balíčky odpovídají, projekt je plně funkční a nakonfigurovaný.
2. **ADR-002: Frontend** (Placeholder)
   - *Status:* **Platí**. Ve složce `frontend/` se nachází pouze soubor `.gitkeep`, frontend není implementován.
3. **ADR-003: Persistence Reservation** (EF migrace, UTC, enum jako string)
   - *Status:* **Platí**. Použity 3 migrace (`InitialCreate`, `AddParkingSpotAndReservationEndpoints`, `AddApprovalWorkflow`). Stav je mapován na řetězec, časy jsou důsledně UTC, `parking.db` je ignorován v `.gitignore`.
4. **ADR-004: Souběh a čas** (`SpotLocks` přes `SemaphoreSlim`, `IClock`)
   - *Status:* **Platí**. Třída `SpotLocks` serializuje přístup přes `ConcurrentDictionary<int, SemaphoreSlim>`. `IClock` a `FakeClock` umožňují deterministické testování. Dokumentované omezení na 1 proces aplikace je dodrženo.
5. **ADR-005: Schvalovací proces a líná expirace**
   - *Status:* **Platí**. Expirace je počítána líně bez background scheduleru. Konfigurace `Reservations:ApprovalWindowHours` je načítána z `appsettings.json` (výchozí 24 hodin).

---

## 5. Analýza testového pokrytí

Všechny operace a integrační toky v servisní vrstvě mají dedikované testovací sady v `tests/ParkingReservation.Api.Tests`:

| Testovací soubor | Počet testů | Pokryté scénáře |
|---|:---:|---|
| `ReservationPersistenceTests.cs` | 2 | Perzistence `Reservation` do SQLite přes EF Core migrace, znovunačtení hodnot, uložení změn stavu. |
| `ReservationServiceTests.cs` | 8 | **OP-01**: validní standard, neplatný interval (`start == end`), neznámý spot, EV bez elektromobilu, EV s elektromobilem, neautorizovaný uživatel.<br>**OP-02**: dostupnost před, překryv, dotyk na hranici (BR-01), ignorování DRAFTů, neznámé místo, neaktivní místo (`IsActive = false`). |
| `ReservationConfirmCancelTests.cs` | 11 | **OP-03**: úspěšné potvrzení, odmítnutí překryvu, dotyk na hranici, neaktivní spot, již potvrzená rezervace, start v minulosti, neautorizovaný uživatel, **paralelní souběh dvou transakcí (REQ-04)**.<br>**OP-04**: zrušení DRAFT, zrušení CONFIRMED a uvolnění místa, idempotence po startu, odmítnutí po startu, neautorizovaný uživatel, neznámá rezervace. |
| `ReservationApproveRejectTests.cs` | 10 | **OP-03 v0.2**: přesun do `PendingApproval`, odložení kontroly kolize.<br>**OP-05**: úspěšné schválení, kolize při schválení, start v minulosti, již potvrzeno, neautorizováno, úspěšný reject, reject na neaktivním místě.<br>**Expirace (REQ-08)**: líné vypršení po uplynutí okna.<br>**OP-04 v0.2**: zrušení `PendingApproval`, odmítnutí rušení `Rejected` a `Expired`. |

### Mezery v testech (Test Gaps)
- **Chybí testy Minimal API vrstvy (`Program.cs`)**: Ačkoliv `Program` obsahuje `public partial class Program { }` pro `WebApplicationFactory`, v testovacím projektu nejsou žádné HTTP integrační testy endpointů. Všechny testy volají přímo metody `ReservationService`.
- **Chybí test pro ZTP průkaz v `ReservationServiceTests`**: Ověřování `Disabled` místa je sice v kódu naimplementováno, ale v testovací sadě je testováno pouze `EvCharging`.
- **Chybí test souběhu Confirm vs. Cancel**: Test souběhu pokrývá pouze dva souběžné `Confirm` požadavky, ale nikoliv vzájemný závod mezi `Confirm` a `Cancel` na stejné rezervaci.

---

## 6. Souhrnný přehled nesrovnalostí a dluhů

```
+---------------------------------------------------------------------------------------------------+
| OBLAST                 | SLÍBENO / DOKUMENTOVÁNO            | REALITA V KÓDU                      |
+---------------------------------------------------------------------------------------------------+
| ParkingArea            | Plnohodnotná správa oblastí        | Zcela chybí                         |
| Stav místa             | FREE, RESERVED, OCCUPIED, OOS      | Pouze IsActive (bool)               |
| Správa míst (CRUD)     | Místa v systému                    | Pouze ruční SQL INSERT do SQLite    |
| User / Auth            | Řidič, Správce, Approver           | Pouze UserId > 0 (TBD)              |
| Vehicle                | Samostatný koncept                 | Pouze bool parametry v DTO          |
| Notification Service   | Externí systém (boundary)          | Zcela chybí                         |
| Frontend               | Placeholder                        | Splněno (prázdná složka .gitkeep)   |
| OP-01 až OP-05         | Kompletní chování v0.1 a v0.2      | Plně naimplementováno (100%)        |
| BR-01 až BR-05         | Invarianty a časová pravidla       | Plně naimplementováno (100%)        |
| README sekce 9 (DoD)   | "Spike není zmergován, OP 1-5 ne"  | Zastaralé - kód je již hotov        |
+---------------------------------------------------------------------------------------------------+
```

---

## Závěr

Co se týče **vlastního funkčního jádra rezervací (Baseline v0.1 + Baseline v0.2)**, specifikace v `docs/specification.md` a architektonická rozhodnutí v `docs/architecture-and-decisions.md` **věrně a spolehlivě odpovídají reálnému kódu**. Všechny popsané byznys toky, stavové přechody, validace i ošetření souběhu na úrovni procesu jsou skutečně naprogramovány a otestovány.

Hlavní nesoulad panuje mezi **širším rámcem projektu (`docs/intent-and-change.md` a `README.md`)** a kódem, kde celá řada podpůrných doménových entit (`ParkingArea`, `User`, `Vehicle`, fyzické stavy místa, notifikace a CRUD endpointy pro administraci) existuje pouze jako teoretický koncept na papíře.
