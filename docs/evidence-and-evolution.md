# Evidence a evoluce

## C01 Engineering Spike — A: Persistence

**Question / unknown:**
Dokážeme z Node.js a TypeScriptu pomocí knihovny `pg` uložit rezervaci do PostgreSQL a načíst ji zpět beze změny dat?

**What we did:**
Vytvořili jsme skript `src/spike.ts`, který vytvoří tabulku `reservations`, vloží testovací rezervaci a načte ji podle vráceného ID. Ověří ID, uživatele, křečka, oba časy a stav. Spouští se příkazem `npm run spike` (`tsc && node dist/spike.js`); při chybě vrací kód `1`.

**Observed result:**
Běh proti skutečné lokální PostgreSQL vytvořil tabulku, uložil rezervaci s ID `1` a ověřil shodu všech polí po načtení. Návratový kód byl `0`. Při samostatné kontrole nedostupné databáze skript správně vrátil kód `1`.

- Datum ověření: 16. 9. 2026.
- Spustil: Codex při společné kontrole v lokálním prostředí projektu.
- Prostředí: Windows, Node.js `v22.14.0`, PostgreSQL `17.11`.
- Databáze: testovací `hamster_reservations`.
- Příkaz: `npm run spike`.

Krátký výňatek ze skutečného výstupu úspěšného běhu:

```text
✅ Rezervace uložena s ID: 1
✅ Spike úspěšný: Načtená data odpovídají uloženým datům!
```

**Decision / what changes because of the result:**
Ponecháváme knihovnu `pg` a připojení přes pool jako základ pro rezervační API. Uložení a načtení dat je ověřené; dalším krokem je napojení API a business pravidel, která tento spike netestuje.

## Change + review smyčka

- Zadání: [issue #1 — Ověření ukládání do databáze](https://github.com/tomaskirnig/SWI_2027/issues/1).
- Implementace: [PR #3 — Persistence](https://github.com/tomaskirnig/SWI_2027/pull/3), autor `tomaskirnig`.
- Review: [schválení od Theromantus](https://github.com/tomaskirnig/SWI_2027/pull/3#pullrequestreview-5221734632), 16. 9. 2026 v 10:55 UTC.
- Integrace: `MartySagin`, 16. 9. 2026 v 11:23 UTC, merge commit `979e3e2`.

---

## Evidence C02: specifikace → běžící aplikace

**Přijatá baseline:**  
Specification Baseline v0.1 (základní operace Create, Check Availability, Confirm, Cancel) a Baseline v0.2 (rozšíření o schvalovací proces se správcem křečka a automatickou expiraci).

**Předvedené základní operace:**  
1. `OP-01 Create Reservation` (vytvoření návrhu `DRAFT` s předběžnou kontrolou).
2. `OP-02 Check Availability` (čtecí dotaz na dostupnost křečka bez změny stavu).
3. `OP-03 Confirm Reservation` (přímé potvrzení nebo přechod do `PENDING_APPROVAL`).
4. `OP-04 Cancel Reservation` (storno před začátkem z `DRAFT`, `CONFIRMED` i `PENDING_APPROVAL`).
5. `OP-05 Approve / Reject Reservation` (schválení či zamítnutí správcem křečka).
6. `OP-06 Expire Reservations` (automatická expirace žádostí 1h před začátkem).

**Skutečně provedené automatizované ověření:**

Byl vytvořen integrační ověřovací skript `src/verify.ts`,
spouštěný příkazem:

```bash
npm run verify
```

Ověření zahrnuje:

- vytváření rezervací a validaci vstupů,
- dostupnost a překryvy intervalů,
- denní limit student–křeček,
- potvrzení a rušení rezervací,
- souběžné operace Confirm / Cancel,
- souběžná konfliktní potvrzení,
- schvalovací proces `PENDING_APPROVAL`,
- zamítnutí a ručně/testem spouštěnou expiraci,
- selhání doručení Notification Service bez vrácení úspěšné změny stavu.

Byly spuštěny všechny scénáře `V-01` až `V-26`, včetně doplňkových scénářů `V-15A`, `V-15B`, `V-20A` a `V-20B`.

**Historie a nové ověření po opravě assertions:**
Původní běh vykázal 30 PASS / 0 FAIL. Následnou kontrolou v auditu bylo zjištěno, že původní import `import { assert } from 'console'` nevyhazoval při nesplněné podmínce výjimku, což mohlo propustit skrytá selhání. V souboru `src/verify.ts` byl import opraven na `import assert from 'node:assert/strict'`. Správná detekce selhání byla prakticky prokázána dočasným scénářem s `assert(false)`, který spolehlivě skončil jako `[FAIL]`. Následně byly všechny scénáře spuštěny se striktními assertions.

Výsledek skutečného nového běhu:

```text
PASS: 30
FAIL: 0
CELKEM: 30
```

Všechny definované ověřovací scénáře prošly se striktními assertions úspěšně.

- Datum nového běhu: 15. 10. 2026.
- Commit implementace: aktuální revize větve `codex/c02-basic-operations`.
- Prostředí: dedikovaná cloudová PostgreSQL (Supabase).
- Příkaz: `npm run verify`.
- Výsledek: `30 PASS`, `0 FAIL`.
- Rozsah: Integrační a doménové ověření aplikačních operací, souběhu a transakcí (nejedná se o plný HTTP E2E walking skeleton, který náleží do CP1).

**Nalezené nesoulady a způsob vyřešení:**  
- Operace Create, Confirm a Cancel používají časovou hranici
  `currentTime <= start - 15 min`.
- Pro schvalovací proces Baseline v0.2 byla zavedena samostatná
  hranice: Správce křečka může rozhodnout pouze při
  `currentTime < start - 1h`.
- Od okamžiku `currentTime >= start - 1h` je nerozhodnutá rezervace
  `PENDING_APPROVAL` určena k expiraci.
- Stav `PENDING_APPROVAL` v Baseline v0.2 blokuje dostupnost křečka
  a dočasně čerpá denní limit (dopad na Create i Confirm).
- Stavy `REJECTED` a `EXPIRED` jsou koncové a uvolňují dostupnost
  křečka i studentův denní limit.
- Expirace je implementována jako funkce `expirePendingReservations()`
  a ručně vyvolatelný REST endpoint `POST /api/reservations/expire`.
  Automatické periodické spouštění na pozadí není v této verzi implementováno
  a je předmětem architektonického návrhu v C03.

**Ověření spolehlivosti oznámení:**  
Pro scénáře `V-15B` a `V-20A` je doručení Notification Service
v automatizovaném ověření ovladatelné pomocí stubu (`setNotificationSender`),
aby bylo možné deterministicky simulovat jeho selhání.

Při selhání doručení:
- již provedený business přechod není vrácen zpět,
- rezervace zůstává ve stavu `CONFIRMED` nebo `CANCELLED`,
- odpověď obsahuje rozlišitelné varování,
- příslušný záznam v `notifications_outbox` zůstává evidovaný
  se stavem `FAILED` pro pozdější opakování (automatický background retry
  worker je přenesen do C03).

**Shrnutí dopadu změny:**  
Zavedením schvalovacího procesu přibyl mezistav `PENDING_APPROVAL`,
který křečka dočasně blokuje a dočasně čerpá studentův denní limit.
Dále přibyly koncové stavy `REJECTED` a `EXPIRED`, které blokování
i čerpání limitu uvolňují. Vznikla role `Správce křečka` (v demonstračním
prototypu simulovaná hlavičkou `x-user-role`, nikoli produkční IdP)
a obslužná funkce/endpoint pro expiraci.

**Zbývající předpoklad / neznámá:**  
- Provozní parametry Outbox mechanismu (interval opakování a max. počet pokusů doručení e-mailových notifikací).
- Konkrétní externí Notification Service a její produkční integrace.
- Způsob perzistence a konfigurace automatického plánovače (Scheduler) v produkčním prostředí (součást rozhodování C03).

**Architektonické drivery přenesené do C03:**  
1. *ACID transakce / izolace při souběhu (Concurrency driver):* Zajištění, že dva souběžné požadavky na Confirm nezpůsobí dvojí rezervaci křečka ani překročení 30min denního limitu (`REQ-07`).
2. *Transactional Outbox Pattern (Reliability driver):* Spolehlivé doručování oznámení externí službou bez zablokování hlavní transakce.
3. *Asynchronní schvalovací workflow a Scheduler (Async/Timer driver):* Oddělení procesu žádosti a rozhodnutí, mechanismus pro automatickou expiraci bez manuálního zásahu.

### Týmové schválení baseline

- **Baseline:** Specification Baseline v0.1 a Baseline v0.2
- **Schválená verze dokumentů:** aktuální revize po zapracování připomínek C02 (větev `codex/c02-basic-operations`)
- **Datum schválení:** 15. 10. 2026
- **Schválili:** Martin Kalus, Tomáš Kirnig, Petr Gála, Dennis Carnevale
- **Otevřené body:** Rozsah automatického spouštění na pozadí (cron/timer) a oddělení perzistenční vrstvy (Repository) jsou otevřeny pro řešení v navazující fázi C03.

---

## C03 — Architecture Evidence

**Baseline:** v0.2  
**Part A:** Sledován scénář `OP-03 Confirm Reservation`, zmapován v [docs/architecture-and-decisions.md](architecture-and-decisions.md) (oddíly A1–A8).

**Drivers:**
1. *Concurrency & Exclusivity (`BR-02`, `REQ-04`, `REQ-07`):* Autoritativní rozhodnutí v transakčním zámku zabraňující souběžné dvojí alokaci.
2. *Delayed Approval Workflow & Expiration (`REQ-10`, `REQ-13`, `BR-03`):* Přesah stavu `PENDING_APPROVAL` přes request a automatická expirace v čase `start - 1h`.
3. *Reliability & Transactional Outbox (`REQ-06`, `BR-06`):* Nezávislost commitu rezervace na dostupnosti externí notifikační služby.
4. *Decoupling of Domain Rules from Persistence (A8):* Oddělení orchestrace a čistých doménových pravidel od raw SQL a databázového klienta.

**Decision question:**  
Kde a jak má být vlastněn delayed approval workflow a časovač expirací nerozhodnutých žádostí?

**Alternatives:**
- *Alternativa A:* In-process modul v monolitické aplikaci s neblokujícím časovačem.
- *Alternativa B:* Samostatný runtime worker proces / plánovač.

**Scenario walkthrough:**  
Detailně popsán v oddílu E3 pro scénář potvrzení rezervace křečka vyžadujícího schválení (*Archimedes*), následovaný nečinností správce a automatickou expirací.

**ADR:**  
`ADR-01 — Umístění a vlastnictví delayed approval workflow a časovače expirací` (přijata Alternativa A s modulárním rozhraním).

**Views:**
- *domain class:* oddíl C1 (třídní diagram doménových pojmů v Mermaid bez frameworku)
- *context:* oddíl G1 (kontextový diagram s aktéry Student, Správce křečka a Notification Service)
- *static architecture:* oddíl G2 (diagram komponent s explicitním vlastnictvím: `Reservation Management`, `Availability`, `Approval Workflow`, `Reservation Persistence`, `Notification Integration`)
- *state ownership:* oddíl G3 (tabulka mapování přechodů statechartu na komponenty)
- *runtime/deployment:* oddíl G4 (mapování komponent do Node.js procesu PID 1, napojení na PostgreSQL a Notification Service)
- *design sequence:* oddíl H1 (návrhový sekvenční diagram pro Confirm Reservation s větví `alt` pro kolizi a větvením pro approval)
- *focused design class:* oddíl H2 (návrhový třídní diagram s `IReservationRepository`, `PostgresReservationRepository`, `ReservationService`, `ApprovalService`)

**Cross-view issues found/resolved:**  
Vyhodnoceno 7 vazeb v oddílu I; všechny vazby C02↔G2, C2↔G2, G2↔H1, H1↔H2, statechart↔G3/H1, G2↔G4 a ADR↔G2/G4 jsou vzájemně plně konzistentní.

**AS-IS → TO-BE delta:**  
Zpracována v oddílu J; identifikovány akce `CHANGE` pro vyčlenění perzistenční vrstvy (Repository), zprovoznění in-process časovače expirací a zavedení automatického architektonického testu.

**Implementation changes:**
1. Vytvořen soubor `src/repository.ts` s rozhraním `IReservationRepository` a třídou `PostgresReservationRepository`, kam byly vyčleněny raw SQL dotazy a transakční metody.
2. Refaktorován soubor `src/service.ts`, který deleguje databázové operace na repozitář a soustředí se na orchestraci a doménová pravidla.
3. Upraven soubor `src/app.ts`, ze kterého byl odstraněn přímý import `pool` i raw SQL dotazy (volá výhradně service a repository rozhraní).
4. V `src/index.ts` byl zprovozněn in-process neblokující plánovač expirací `startExpiryScheduler()` s recovery při startu serveru (`runExpiryCheck()`).
5. Vytvořen soubor `src/arch.test.ts` a přidán npm skript `test:arch`.

**Behaviour verification:**
- Příkaz: `npm run verify`
- Výsledek: `30 PASS`, `0 FAIL` (všech 30 integračních a doménových scénářů V-01 až V-26 prošlo úspěšně se striktními assertions).

**Architecture conformance rule + result:**
- *Architektonické pravidlo:* Žádný kontroler (`src/app.ts`) ani doménová logika (`src/domain.ts`) nesmí přímo importovat databázový ovladač `pg` ani db pool; perzistence je izolována v `src/repository.ts`. Doména `src/domain.ts` obsahuje pouze čisté funkce bez infrastruktury.
- *Kontrola:* `npm run test:arch` (automatický skript `src/arch.test.ts`)
- *Výsledek:* `ARCH-01 PASS`, `ARCH-02 PASS`, `ARCH-03 PASS`.

**Remaining uncertainty / risk:**  
V případě budoucího horizontálního škálování Node.js aplikace na více instancí bude nutné in-process timer doplnit o distribuovaný zámek (např. `pg_advisory_lock`) nebo vyčlenit do samostatného cron workeru (Alternativa B z ADR-01).

**Commit / tag:**  
Pracovní větev `C03`, připraveno pro odevzdání cvičení C03.
