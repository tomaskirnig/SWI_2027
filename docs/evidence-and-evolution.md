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

Historický záznam C02 před refaktoringem. Následující části C03/C05 a oddíl oprav z 22. 10. 2026 popisují další vývoj; nová ověření nejsou zpětně vydávána za původní běh.

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
- Referenční commit uložené C02 baseline: `b05507977e7aaa4c0132f206c4bc21c91024f184` (historická větev `codex/c02-basic-operations`).
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
- *runtime/deployment:* oddíl G4 (mapování komponent do jednoho Node.js procesu s interním notifikačním stubem a připojením k PostgreSQL)
- *design sequence:* oddíl H1 (návrhový sekvenční diagram pro Confirm Reservation s větví `alt` pro kolizi a větvením pro approval)
- *focused design class:* oddíl H2 (návrhový třídní diagram se skutečnými repository/policy rozhraními a moduly exportovaných operací)

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
- *Výsledek:* `ARCH-01 PASS` až `ARCH-04 PASS` (nové ověření 22. 10. 2026).

**Remaining uncertainty / risk:**  
Při více instancích zajišťují správnost expirací zámky PostgreSQL. Kvůli zátěži z více timerů může být později vhodný samostatný worker; jde o provozní rozhodnutí, ne podmínku správnosti této verze.

**Commit / tag:**  
Původní implementace C03: `021ffbc7dad925e6a190df3069772f755d5447ca`. Aktuální lokální opravy a ověření viz oddíl z 22. 10. 2026 níže.

---

## C05 DD Verification Evidence

### 1. Selected architecture unit / responsibility
- **Unit:** `ConfirmationPolicy pro OP-03` (v rámci `Reservation Management` a [src/domain.ts](../src/domain.ts)).
- **Scope:** Přísné deterministické vyhodnocení podmínek pro přechod rezervace z `DRAFT` do `CONFIRMED` / `PENDING_APPROVAL` (`BR-01` až `BR-05`).

### 2. Tests derived from DD
Odvozeno celkem 10 unit testů pokrývajících kontrakt rozhraní, větvení algoritmu, přechody stavů, doménové invarianty i chování při chybě:

| ID testu | DD element / rozhodnutí | Co musí platit? | Test level | Testovací případ |
|---|---|---|---|---|
| **T-DD-01** | Interface Contract (`BR-01`) | Neplatný interval (`start >= end`) je okamžitě odmítnut bez DB. | Unit | `INVALID_INTERVAL` při obrácených časech. |
| **T-DD-02** | Algorithm Branch (`BR-03`) | Časový předstih < 15 minut před začátkem je odmítnut. | Unit | `LEAD_TIME_VIOLATION` při potvrzení 14 min před začátkem. |
| **T-DD-03** | Failure Behavior | Neaktivní křeček nesmí být potvrzen. | Unit | `HAMSTER_INACTIVE` pro křečka Spávka (`isActive = false`). |
| **T-DD-04A** | State Transition (`BR-05`) | Běžný křeček přejde přímo do stavu `CONFIRMED`. | Unit | `ferda` bez nutnosti schválení &rarr; `CONFIRMED`. |
| **T-DD-04B** | State Transition (`BR-05`) | Křeček s dohledem přejde do stavu `PENDING_APPROVAL`. | Unit | `archimedes` vyžadující dohled &rarr; `PENDING_APPROVAL`. |
| **T-DD-05A** | Collision Detection (`BR-02`) | Překryv s existujícím slotem vrátí kolizi. | Unit | `SLOT_CONFLICT` při intervalech 14:00–14:30 a 14:15–14:45. |
| **T-DD-05B** | Collision Detection (`BR-01`) | Dotyk hranic intervalů (14:30) není kolize. | Unit | Úspěšné potvrzení navazujícího slotu 14:30–15:00. |
| **T-DD-06A** | Daily Limit (`BR-04`) | Překročení součtu 30 minut v kalendářním dni je odmítnuto. | Unit | `DAILY_LIMIT_EXCEEDED` při 20 min existujících + 15 min nových. |
| **T-DD-06B** | Daily Limit Calculation | Rezervace přes půlnoc rozpočte minuty do obou kalendářních dnů. | Unit | 23:50–00:10 v `Europe/Prague` &rarr; 10 min den 1, 10 min den 2. |
| **T-DD-07** | State Machine Invariant | Rezervaci ve stavu `CANCELLED` již nelze znovu potvrdit. | Unit | `INVALID_STATE` při pokusu potvrdit zrušený termín. |

### 3. Justification of Test Levels (podrobné odůvodnění min. 2 testů)

#### Test T-DD-02 (Předstih 15 minut – Algorithm branch):
- **Selected level:** `Unit test`
- **Why this level:** Pravidlo předstihu je čistá časová matematika závislá pouze na dvou instancích času (`currentTime` a `start`). Testování na unit úrovni umožňuje deterministicky předat libovolný virtuální čas `now` bez nutnosti běžící databáze nebo HTTP serveru a bez závislosti na systémových hodinách OS.
- **What design decision does this test verify?** Ověřuje návrhové rozhodnutí, že `ConfirmationPolicy` přijímá referenční čas `currentTime` jako explicitní parametr kontraktu a vynucuje striktní nerovnost `currentTime <= start - 15 min` (`BR-03`).

#### Test T-DD-06B (Výpočet čerpání limitu přes půlnoc – Domain Calculation):
- **Selected level:** `Unit test`
- **Why this level:** Výpočet minut v jednotlivých dnech pásma `Europe/Prague` závisí na přesném rozpadu časových zón (letní/zimní čas a přechod půlnoci). Izolovaný unit test přímo ověřuje návratovou mapu minut pro dotčené dny bez režie síťového I/O.
- **What design decision does this test verify?** Ověřuje návrhové rozhodnutí `DR-05`, že denní limit se nepočítá jako plovoucí 24hodinové okno, nýbrž striktně po kalendářních dnech v pražské časové zóně (`BR-04`).

### 4. Unit / Component tests executed
- **Příkaz:** `npm run test:unit` (`tsx src/domain.test.ts`)
- **Výsledek:** `10 PASS`, `0 FAIL` (100% úspěšnost).
- **Prostředí:** čistý in-memory běh bez databáze.

### 5. Design ↔ Implementation consistency matrix
| DD element / decision | Implemented? | Evidence | Action |
|---|:---:|---|---|
| Rozhraní `IConfirmationPolicy` a třída `ConfirmationPolicy` | `YES` | [src/domain.ts](../src/domain.ts) | `KEEP` |
| Vstupní kandidát `ConfirmationCandidate` a `HamsterProfile` | `YES` | [src/domain.ts](../src/domain.ts) | `KEEP` |
| Výsledkový kontrakt `ConfirmationResult` a chybové kódy | `YES` | [src/domain.ts](../src/domain.ts) | `KEEP` |
| Izolované unit testy odvozené z DD (T-DD-01 až T-DD-07) | `YES` | [src/domain.test.ts](../src/domain.test.ts) | `KEEP` |
| NPM skript `test:unit` pro automatické spouštění | `YES` | [package.json](../package.json) | `KEEP` |
| Zpětná kompatibilita s C02 integračními testy (30 scénářů) | `YES` | [src/verify.ts](../src/verify.ts) (`30 PASS / 0 FAIL`) | `KEEP` |
| Architektonická pravidla L2 (izolace vrstev) | `YES` | [src/arch.test.ts](../src/arch.test.ts) (`4 PASS`) | `KEEP` |

### 6. Design ↔ Implementation mismatch & resolution
- **Nalezená neshoda (22. 10. 2026):** policy existovala jen jako izolovaná třída/testy a reálný Confirm ji nevolal. Neshoda je opravena: služba nyní používá její výsledek. R-01 ověřuje napojení přes HTTP i odmítnutí bez změny dat.
- **Resolution:** zachovat čistý návrh policy, zapojit jej do skutečné operace a odstranit duplicitní rozhodování ze služby.

### 7. Remaining design risk
- Policy důvěřuje předaným slotům a mapě minut; konzistenci při zápisu musí zajistit stejná transakce a zámek křečka. R-07 proto ověřuje i souběh skutečných potvrzení. Produkční identita a skutečný notifikační provider zůstávají mimo rozsah prototypu.


### C05 Commit/tag

Původní implementace C05: `21f85bd0694ac355da76d3a762651acba81613ba`. Dnešní opravy jsou lokální pracovní změny nad mainem `d8ed26feb8c19d73bc4320d5c24b082054b09632`, nikoli nový commit.

## Ověření oprav 22. 10. 2026

**Verze:** main `d8ed26feb8c19d73bc4320d5c24b082054b09632` + lokální opravy z této kontroly. Přesnou podobu změněných zdrojů identifikuje [manifest](verification-2026-10-22.json). Změny nebyly commitnuté ani pushnuté.

**Prostředí:** Windows, Node.js 22.14.0, samostatná lokální PostgreSQL 17.11; nepoužita sdílená Supabase. Testy mažou rezervace a outbox, proto patří výhradně do oddělené testovací DB.

| Příkaz | Skutečný výsledek |
|---|---|
| npm run build | Bez chyb |
| npm test | 10 unit PASS + 4 architektonické kontroly PASS |
| npm run verify | 30 původních scénářů PASS + 7 regresních scénářů PASS |

| Regrese | Ověřený návrhový záměr |
|---|---|
| R-01 | HTTP walking skeleton; Confirm respektuje skutečný výsledek policy; odmítnutí nemění data ani outbox. |
| R-02 | Approve/Reject přidají právě jeden PENDING požadavek studentovi bez slibu doručení. |
| R-03 | Zámek získaný expirací nedovolí souběžnému Cancel změnit EXPIRED. |
| R-04 | Zámek získaný Cancel nedovolí expiraci přepsat CANCELLED. |
| R-05 | Dvě současné expirace provedou jeden přechod a vytvoří dvě zprávy, nikoli čtyři. |
| R-06 | Selhání zápisu outboxu vrátí zpět změnu stavu i dřívější zprávu ve stejné transakci. |
| R-07 | Dvě nekolidující potvrzení stejné dvojice nepřekročí denní limit. |

**Vyřešené rozdíly:** nezamčený výběr expirací, nepoužívaná ConfirmationPolicy, transakce mimo deklarovaného vlastníka, diagram neexistujícího dispatchera, rozpor mezi doručením a evidencí oznámení a nejasná veřejnost OP-02. Zdrojové změny mají odpovídající regresní doklady a C03/C05 pohledy byly upraveny podle přijatého rozsahu.

**Remaining risk:** NotificationSender simuluje úspěch; zprávy Decide/Expire/správce zůstávají PENDING. Dispatcher, automatický retry a produkční autentizace jsou možné další rozšíření, ne ověřené funkce této verze. Periodická expirace reaguje při kontrole, nikoli v garantovaném reálném čase.

## C06 Internal Evidence Assessment

**Datum owner review:** 23. 10. 2026.

### Assessed baseline

- Hodnocený commit: `996e9be8880187314e14d294c6fcc11974b50556`.
- Hodnotící tým: Deadlock. Přijatý checklist a nálezy: [Hodnoceni_C06_Kreckomat v5.md](../Hodnoceni_C06_Kreckomat%20v5.md).
- Kontrola vlastníků proběhla nad checkoutem `98a8a9a0fa9bfa98d54a1ec18e47cb3323fb88d3`; porovnání s hodnoceným commitem neukázalo změny v `src`, `public`, `docs`, `README.md` ani `package.json` před doplněním této reakce.

### Verified findings

- **F1 — zastaralý čas při rozhodnutí:** potvrzeno porovnáním REQ-05/BR-01 se službou a spuštěním původních funkcí Confirm/Approve s řízenými hodinami a simulovaným čekáním repository. Při překročení lhůty během čekání obě funkce nesprávně uspějí a požádají o změnu stavu i zápis outboxu. Kontrolní případy před lhůtou uspěly, požadavky přijaté po lhůtě byly odmítnuty bez požadavků na zápis.
- **F2 — nesprávný denní limit v UI:** potvrzeno spuštěním původních frontendových funkcí v Node VM s náhradou DOM/API. Čekající žádost na 20 minut se započítá jako 0; rezervace začínající 00:10 v Praze se při UTC datu předchozího dne do správného dne nezapočte; interval 23:50–00:10 se do prvního dne započítá jako 20 místo 10 minut. Při již využitých 20 minutách UI zablokuje platný nový interval 23:50–00:10, ačkoli denní součty mají být 30 a 10 minut. Serverové překročení limitu nebylo tímto nálezem prokázáno.

### Owner disposition

| Položka | Rozhodnutí | Odůvodnění |
|---|---|---|
| F1 | ACCEPTED — change required | Implementace používá čas před čekáním, specifikace vyžaduje čas při rozhodnutí. |
| F2 | ACCEPTED — change required | Implementovaný ukazatel a místní kontrola limitu neodpovídají BR-04 v0.2. |
| F3 — zamítnutý kandidát | REJECTED — no change required | Souhlas se závěrem hodnotitele. Oba dodané podklady C03, včetně Part A a částí E2–E3/L1–L2/M plného zadání, nestanovují samostatný výstup Quality & Measurement popsaný v C06. Q1–Q3 = N/A je podle dostupných podkladů odůvodněné. |
| D4 — mezera v testech | ACCEPTED — change required | Chybí trvalé testy přesné hranice 15 minut a hodnoty o 1 ms později; samotná policy se při dodatečné kontrole chovala správně. |

### Actions / justified no-change decisions

Následující opravy jsou plánované; v rámci owner review byla doplněna dokumentace, implementace zůstává v hodnoceném stavu.

- **F1:** zavést předávaný zdroj času, odečítat aktuální čas po potřebných načteních a zámcích před rozhodnutím Confirm/Decide; u Decide zahrnout zámek křečka. Prověřit obdobné použití času v Cancel. Doplnit regrese čekání přes lhůtu s kontrolou odmítnutí, zachovaného stavu a nezměněného outboxu. Upravit kontrakty a sekvence podle finálního řešení.
- **F2:** započítávat CONFIRMED i PENDING_APPROVAL, rozdělit existující i požadované intervaly podle Europe/Prague a kontrolovat limit v každém dotčeném dni. Doplnit trvalé testy uvedených případů a zachovat serverovou kontrolu limitu.
- **D4:** doplnit unit případy úspěchu přesně 15 minut před začátkem a odmítnutí o 1 ms později.
- **F3:** podle předaných zadání nový výstup C04 nedoplňovat. Povinnost samostatného měření kvality není v těchto podkladech doložena; závěr se nevztahuje na případné další nepředané pokyny vyučujícího.

### Remaining evidence gaps

- Při owner review prošlo 10 stávajících unit testů a 4 architektonické kontroly. Byly spuštěny pomocným prostředím Node.js 24.22.1 s odstraněním TypeScript typů a načtením modulů ve VM; nešlo o běh `npm test` přes projektové závislosti.
- F1 byl reprodukován se simulovanou repository a hodinami. Skutečné čekání na PostgreSQL zámky, rollback databáze ani end-to-end HTTP průchod tímto ověřením testovány nebyly. Zaznamenány byly požadavky na zápisy do náhradní repository.
- F2 byl ověřen s náhradou DOM a API; ověření v prohlížeči se skutečným backendem a regresní ověření budoucích oprav zbývá provést.
- Dočasné ověřovací kontroly nejsou součástí trvalé testové sady. Build a databázové integrační sady nebyly při owner review opakovány; výše uvedené výsledky z 22. 10. 2026 jsou historickou evidencí.
- Podklady C03 použité pro posouzení F3: `SWI_C03_PartA_Tuesday_students_bilingual_v8.html` a `SWI_C03_students_bilingual_v10.html`. Závěr N/A vychází z jejich obsahu a pravidla C06 nehodnotit nezadané požadavky.

## Registr rizik C07/C08

**Stav k 16. 11. 2026.** Výchozí verze tohoto záznamu je `main` na commitu `c39d54feda198c78c1b330ce3008f2eb6e83ae97`. Nálezy C06 se nadále vztahují k hodnocenému commitu `996e9be8880187314e14d294c6fcc11974b50556`. Záznam doplňuje [část B zadání C07](../zadani/SWI_C07_C08_Assignment_CZ_EN_FINAL.html).

Pravděpodobnost **L** i dopad **I** mají stupnici 1 (nízký), 2 (střední), 3 (vysoký). Priorita je součin L × I podle zadání: 1–2 LOW, 3–4 MEDIUM, 6–9 HIGH. Počáteční a očekávané hodnoty jsou odhady. Skutečné zbytkové riziko se vyhodnotí až po provedení opatření a kontrole důkazů. Vlastníci a termíny níže jsou návrhy k potvrzení týmem. Kde je známá návaznost na další výstup, termín je vyjádřený projektovým krokem.

### Otevřené akce po C06

| Položka | Stav | Navržený vlastník a termín | Důkaz pro uzavření |
|---|---|---|---|
| F1 – zastaralý čas při rozhodnutí | Otevřeno, oprava přijata | Martin Kalus, reprodukce před rozhodnutím C08 a důkaz opravy před rozhodnutím o vydání C09, pokud tým F1 zvolí pro C08. | Confirm a Decide při překročení lhůty během skutečného čekání na zámek požadavek odmítnou. Samostatné čtení DB potvrdí původní stav rezervace a nezměněný outbox. Stejný vzor se prověří u Cancel. |
| F2 – nesprávný výpočet denního limitu ve webu | Otevřeno, oprava přijata | Tomáš Kirnig, navržený interní termín opravy a ověření 27. 11. 2026 v samostatné změně. | Regrese s `PENDING_APPROVAL`, odlišným UTC a pražským datem a intervalem přes půlnoc. Ověřit součet i stav tlačítka ve webu, včetně platného hraničního případu. Serverová kontrola zůstává autoritativní. |
| D4 – chybějící trvalé testy časové hranice | Otevřeno, doplnění testů přijato | Tomáš Kirnig, před regresním během C09. | V běžné sadě `npm run test:unit` projde povolený případ přesně 15 minut před začátkem a očekávané odmítnutí o 1 ms později. |

Podrobnosti a zdroje k těmto akcím jsou v [posouzení C06](#c06-internal-evidence-assessment).

### R-01 Aplikace může při čekání přijmout pozdní potvrzení

- **Kategorie** Technical / Quality.
- **Popis rizika** Confirm a Decide dnes zachytí čas před čekáním na zámky → při souběhu může konkrétní požadavek přečkat lhůtu a projít se starým časem → do DB se uloží potvrzení v rozporu s přijatým pravidlem. Známou příčinou rizika je [vada F1](#verified-findings).
- **Počáteční riziko** L=2, protože cesta se zámkem existuje a scénář byl reprodukován se simulovaným čekáním. I=3, protože jde o neplatnou změnu trvalého stavu. **HIGH (6)**.
- **Strategie** MITIGATE. Opravit časové rozhodnutí ve skutečných cestách a pokrýt souběh regresí.
- **Opatření, vlastník, termín** Martin Kalus. Před rozhodnutím C08 ověřit případ na výchozí verzi, pokud tým vybere F1. Před vydáním verze s opravou prověřit Confirm, Decide a obdobný vzor u Cancel.
- **Důkaz účinnosti a stav** Plánováno. Po zavedení opatření uložit výsledek testu na izolované PostgreSQL, který doloží skutečné čekání na zámek, správné odmítnutí po lhůtě a samostatným čtením ověří stav rezervace a outbox. Přidat kontrolní průchod před lhůtou.
- **Očekávané reziduální riziko** L=1, I=3, **MEDIUM (3)**. Oprava a regrese sníží pravděpodobnost, případný chybný zápis zůstane závažný.
- **Skutečné reziduální riziko** `NOT VERIFIED`.
- **Přijetí reziduálního rizika** Tým Křečkomat po průchodu uvedené regrese a kontrole všech dotčených časových rozhodnutí.
- **Monitoring a reakce** Znovu posoudit při změně zámků nebo práce s časem a před rozhodnutím o vydání. Pokud pozdní operace uspěje nebo se změní DB stav či outbox, nález zůstává otevřený a vydání opravy je `HOLD`.

### R-02 Výpadek databáze může zablokovat ověření

- **Kategorie** External dependency.
- **Popis rizika** Rezervační operace a start aplikace závisejí na PostgreSQL → při výpadku služby, sítě nebo spojení může testovací aplikace ztratit přístup k datům → tým neprovede klíčový scénář nebo neověří výsledek rozpracované operace. [Konfigurace](../src/db.ts) · [Start aplikace](../src/index.ts).
- **Počáteční riziko** L=2, protože spojení s externí DB je reálná závislost. I=3, protože bez DB nelze ověřit rezervaci ani její uložený stav. **HIGH (6)**.
- **Strategie** MITIGATE. Připravit izolovanou alternativu a ověřit reakci na poruchu i návrat spojení.
- **Opatření, vlastník, termín** Dennis Carnevale. Před provozními pokusy C10 připravit samostatnou testovací PostgreSQL a postup obnovy. Před uzavřením C10 provést simulaci výpadku a následný pokus po obnově.
- **Důkaz účinnosti a stav** Plánováno. Zapsat reakci operace a relevantní log, ověřit uložený stav po obnově a provést další běžnou operaci.
- **Očekávané reziduální riziko** L=2, I=2, **MEDIUM (4)**. Záložní prostředí a ověřená obnova omezí dopad výpadku na práci týmu.
- **Skutečné reziduální riziko** `NOT VERIFIED`.
- **Přijetí reziduálního rizika** Tým Křečkomat po úspěšném pokusu C10 a ověření, že izolovanou alternativu lze znovu spustit podle návodu.
- **Monitoring a reakce** Zkontrolovat spojení před integračním během a po změně konfigurace. Při selhání použít izolovanou DB. Před případným opakováním zápisu s neznámým výsledkem nejprve prověřit stav dat. Další kontrola při uzavírání C10.

### R-03 Čistý checkout může na druhém počítači selhat

- **Kategorie** Release / Operation.
- **Popis rizika** [README](../README.md#instalace-a-nastavení) uvádí doporučený runtime a postup orientovaný na Supabase, konkrétní prostředí kandidáta zatím není doložené → druhý člen může narazit na rozdíl v runtime, lokální konfiguraci nebo přípravě DB → nepůjde reprodukovat sestavení a běh kandidáta na vydání.
- **Počáteční riziko** L=2, protože je více variant nastavení a chybí doložený čistý běh druhým členem pro C09. I=3, protože bez reprodukce chybí podstatný důkaz pro rozhodnutí o vydání. **HIGH (6)**.
- **Strategie** MITIGATE. Nechat druhého člena ověřit celý postup jen podle verzovaných instrukcí.
- **Opatření, vlastník, termín** Petr Gála. Před rozhodnutím C09 provést čistý checkout kandidáta, instalaci podle lockfilu, build, testy s izolovanou DB a kontrolní spuštění. Zapsat runtime, kroky přípravy schématu a netajnou konfiguraci.
- **Důkaz účinnosti a stav** Plánováno. V evidenci C09 uložit testovaný commit, prostředí, příkazy, výsledky a log. Pokud chybí krok v návodu, doplnit jej a čistý pokus zopakovat.
- **Očekávané reziduální riziko** L=1, I=3, **MEDIUM (3)**. Ověřený návod sníží pravděpodobnost skrytého lokálního předpokladu, neúspěšná reprodukce vydání dál ovlivní.
- **Skutečné reziduální riziko** `NOT VERIFIED`.
- **Přijetí reziduálního rizika** Tým Křečkomat po úspěšném čistém běhu druhého člena a uložení reprodukovatelného postupu.
- **Monitoring a reakce** Znovu ověřit při změně lockfilu, runtime, konfigurace nebo schématu. Pokud checkout potřebuje nezdokumentovanou ruční úpravu, zaznamenat překážku a odložit vydání do opravy a opakování pokusu. Další kontrola před rozhodnutím C09.

### R-04 Pozdní integrace může odsunout předání C09

- **Kategorie** Schedule / Integration.
- **Popis rizika** [C09](../zadani/C09_ZADANI_CZ_EN_PODROBNE.html) závisí na posouzené změně z [C08](../zadani/C08_FINAL.html) a nové výstupy zatím nejsou doložené → pokud se řešení spojí až při předání, může se pozdě ukázat nesoulad s akceptačními podmínkami → týmu zbude málo času na opravu a opakování integračních testů.
- **Počáteční riziko** L=2, protože karta změny, její review a nový integrační důkaz jsou navazující otevřené kroky. I=2, protože zpoždění je možné zmírnit včasným omezením rozsahu a přeplánováním. **MEDIUM (4)**.
- **Strategie** MITIGATE. Držet se jedné změny a naplánovat kontrolní integrační běh před předáním.
- **Opatření, vlastník, termín** Tomáš Kirnig. Před schválením C08 domluvit vlastníka a druhého člena pro review. Při předání do C09 domluvit termín prvního integračního běhu s rezervou na opravu.
- **Důkaz účinnosti a stav** Plánováno. Posouzená karta C08 s rozsahem a testy, datovaný výsledek prvního integračního běhu před předáním a záznam o vypořádání případných selhání.
- **Očekávané reziduální riziko** L=1, I=2, **LOW (2)**. Včasný běh dává prostor reagovat na zjištěné problémy.
- **Skutečné reziduální riziko** `NOT VERIFIED`.
- **Přijetí reziduálního rizika** Tým Křečkomat po review rozsahu a po integračním běhu, který nechal prostor na případnou opravu a ověření.
- **Monitoring a reakce** Kontrola při předání C08 → C09 a po prvním integračním běhu. Pokud při předání chybí posouzená karta nebo běh selže, znovu odhadnout termín a omezit práci na schválenou změnu a její ověření. Ostatní otevřené akce ponechat v plánu.

## C08 — Ověření F1 na výchozí verzi

**Vazba.** [CR-08](intent-and-change.md#c08--cr-08-rozhodný-čas-při-změně-stavu-rezervace) vychází z [F1](#verified-findings) a [R-01](#r-01-aplikace-může-při-čekání-přijmout-pozdní-potvrzení). Oba případy ověřují [REQ-05](reservation-specification.md#op-03--confirm-reservation--potvrdit-rezervaci) a [BR-01](reservation-specification.md#br-01--význam-časového-intervalu) ve v0.2. Výchozí přechody zachycuje [stavový diagram v0.2](../DIAGRAMS.md#21-aktualizovaný-stavový-diagram-životního-cyklu-v02) a architekturu [ADR-01](architecture-and-decisions.md#adr-01--umístění-a-vlastnictví-delayed-approval-workflow-a-časovače-expirací). Očekávané výsledky byly stanoveny před během podle pravidla `currentTime <= start - 15 min` v okamžiku rozhodnutí. Čas přijetí HTTP požadavku slouží jako vstup do reprodukce.

**Výchozí verze a prostředí.** Oba případy byly spuštěny 16. 11. 2026 na `c39d54feda198c78c1b330ce3008f2eb6e83ae97`. Před během byla porovnána shoda všech souborů v `src/`, manifestů závislostí a `tsconfig.json` s commitem. Prostředí bylo Windows, Node.js 22.14.0, Express 5.2.1, pg 8.23.0, tsx 4.23.13 a izolovaná PostgreSQL 17.11 v čerstvé DB `swi_c08_f1` na `127.0.0.1:55015`. Aplikace připravila schéma přes inicializaci v [repository](../src/repository.ts). [Příkaz a konfigurace](../README.md#ověření-lhůty-confirm-pro-c08) · [Použitý skript](../scripts/verify-c08-f1.cjs).

**Společné podmínky.** Každý případ používá samostatného fiktivního studenta a jiného aktivního křečka bez schvalování, bez kolize a bez vyčerpaného limitu. Fixture má délku 10 minut a stav `DRAFT`. Intervaly jsou `[start,end)` a časy z běhu jsou v UTC. Při opakování určuje skript hranici relativně k systémovému času, přibližně 20 s v budoucnosti pro první případ a 8 s pro druhý. Start je vždy hranice + 15 min. Používá se běžná cesta HTTP Confirm bez časové hlavičky a skutečný `SELECT ... FOR UPDATE`. O čekání rozhoduje PostgreSQL pomocí `pg_stat_activity` a `pg_blocking_pids()`.

### TC-C08-01 — Zámek uvolněný před lhůtou

**Testovací data z běhu.** Rezervace `1`, student `c08-student-early`, křeček `c08-ferda-early`, interval `[10:44:57.410Z,10:54:57.410Z)`, hranice `10:29:57.410Z`, 16. 11. 2026.

| Krok | Akce | Očekávání před během | Skutečnost po běhu |
|---|---|---|---|
| 1 | Uložit fixture a samostatně načíst rezervaci a outbox. | `DRAFT`, 0 záznamů outboxu. | `DRAFT`, 0 záznamů. |
| 2 | Držet řádkový zámek na rezervaci a odeslat `POST /api/reservations/1/confirm` s `{"user_id":"c08-student-early"}`. | Požadavek přijde a prokazatelně čeká před lhůtou. | Odesláno v `10:29:37.427Z`. V `10:29:37.754Z` čekal backend `21668` na zámek držený backendem `25636` (`transactionid`). |
| 3 | Ukončit transakci držící zámek před lhůtou a načíst HTTP odpověď. | `200`, `CONFIRMED`. | COMMIT dokončen v `10:29:37.755Z`. HTTP `200`, `CONFIRMED`. |
| 4 | Po odpovědi samostatným DB dotazem přečíst stav a počet odpovídajících oznámení. | `CONFIRMED`, 1 nový záznam. | `CONFIRMED`, 1 záznam. |

**Verdikt** `PASS`. Kontrolní průchod je referencí pro regresi v C09.

### TC-C08-02 — Zámek uvolněný po lhůtě

**Testovací data z běhu.** Rezervace `2`, student `c08-student-late`, křeček `c08-ferda-late`, interval `[10:44:45.886Z,10:54:45.886Z)`, hranice `10:29:45.886Z`, 16. 11. 2026.

| Krok | Akce | Očekávání před během | Skutečnost po běhu |
|---|---|---|---|
| 1 | Uložit druhou fixture a samostatně načíst rezervaci a outbox. | `DRAFT`, 0 záznamů outboxu. | `DRAFT`, 0 záznamů. |
| 2 | Držet řádkový zámek a ještě před lhůtou odeslat `POST /api/reservations/2/confirm` s `{"user_id":"c08-student-late"}`. | PostgreSQL prokáže, že Confirm čeká na testovací transakci před lhůtou. | Odesláno v `10:29:37.890Z`. V `10:29:37.897Z` čekal backend `11188` na zámek držený backendem `21668` (`transactionid`). |
| 3 | Až po lhůtě ukončit transakci a načíst HTTP odpověď. | `400` s důvodem časového předstihu. | COMMIT zahájen v `10:29:45.995Z` (109 ms po hranici) a dokončen v `10:29:45.996Z`. HTTP `200`, `CONFIRMED`. |
| 4 | Po odpovědi samostatně načíst stav a outbox. | `DRAFT`, 0 nových záznamů. | `CONFIRMED`, 1 záznam. |

**Verdikt** `FAIL`. F1 je pro cestu HTTP Confirm potvrzený na skutečném zámku PostgreSQL. Pozdní požadavek porušil REQ-05 a změnil trvalý stav i outbox. Po schválení změny bude tento případ akceptační regresí AC-02.

**Doklad a rozsah.** Oddělený dotaz po HTTP odpovědi použil `SELECT r.status, count(o.id)::int AS outbox_count FROM reservations r LEFT JOIN notifications_outbox o ON o.reservation_id = r.id WHERE r.id = $1 GROUP BY r.id`. Skript vrátil kód `1` v důsledku `TC-C08-02 FAIL`. Po běhu byla testovací instance ukončena. Pro opakování nastavte novou prázdnou testovací DB podle README. Spuštěné případy pokrývají Confirm s čekáním na zámek řádku rezervace. Přesná inkluzivní hranice, čekání na zámek křečka, Decide a Cancel vyžadují následující ověření. Účinnost budoucí opravy a skutečné zbytkové riziko R-01 jsou `NOT VERIFIED`.

## C09 — Integrace a kandidát na vydání

**Změna a identita kódu.** Tým po review Tomáše Kirniga přijal variantu A v [CR-08](intent-and-change.md#c08--cr-08-rozhodný-čas-při-změně-stavu-rezervace). Výchozí běh C08 je na `c39d54feda198c78c1b330ce3008f2eb6e83ae97`. Implementace vychází z posouzené karty na větvi `dodelani_C07-C10` na `ec5678102256fa96e5d10836c1c265a0e9d699f5`. Obě výchozí verze mají stejný kód operací a závislosti. **After** `58d97bdf53482824c7bfeaa1498884fd74c1bce1`.

**Implementace.** [HTTP API](../src/app.ts) předá volitelný časový override. Běžný Confirm odečte hodiny ve [službě](../src/service.ts) po zámcích a po načtení podkladů. Decide odečte čas po zámku rezervace i křečka. Cancel odečte čas po zámku rezervace a po kontrole idempotentní větve. [Kontrakt a sekvence](architecture-and-decisions.md#část-h1-návrhová-sekvence-confirm-reservation) popisují stejný průchod. Oprávnění, stavy, rollback, schéma a stávající volitelná testovací hlavička mají dosavadní kontrakt. F2 je mimo rozsah CR-08.

### Ověření akceptačních podmínek a regresí

Běh 16. 11. 2026 proběhl na Windows v odděleném adresáři s kódem výchozího commitu a přesnou sadou změn z commitu **After**. Použito Node.js 22.14.0, npm 10.9.2 a nová PostgreSQL 17.11. V adresáři nebyly lokální závislosti ani `.env`. Spuštěno `npm ci`, `npm run check:c09 -- 55386` a smoke sestavené aplikace. Kontrola skončila s kódem `0`. [Úplný lokální výstup](verification-c09.txt) · [Reprodukce z čistého checkoutu](../README.md#c09-ověření-z-čistého-checkoutu).

| Test a příkaz | Očekávání | Skutečnost |
|---|---|---|
| TC-C08-01 · [původní skript](../scripts/verify-c08-f1.cjs) v `check:c09` | Zámek uvolněný před lhůtou → `200`, `CONFIRMED`, jeden nový outbox záznam. | **PASS.** Uvolnění `11:26:53.148Z` před hranicí `11:27:12.988Z`. HTTP `200`, databáze `CONFIRMED` a 1 záznam. |
| TC-C08-02 · stejný skript v `check:c09` | Požadavek čeká před lhůtou, zámek se uvolní po ní → `400` s důvodem předstihu, stav `DRAFT`, outbox beze změny. | **PASS.** PostgreSQL prokázala čekání v `11:26:53.195Z`. Hranice `11:27:01.185Z`, uvolnění `11:27:01.303Z`. HTTP `400`, v DB zůstal `DRAFT` s 0 záznamy. Původní výsledek C08 byl `FAIL`. |
| AC-01/02 a schvalovací větev AC-05 · [nové scénáře](../src/decision-deadline.test.ts) | Confirm na -15 min uspěje, o 1 ms později vrátí `400` bez zápisu. Schvalovací větev uloží `PENDING_APPROVAL` a oznámení pro oba adresáty. | **PASS.** Stav a nové adresáty po úspěchu ověřil nový DB dotaz. Po odmítnutí se stav a celý outbox rovnaly počátečnímu snímku. |
| AC-03 · nové scénáře | Approve i Reject uspějí 1 ms před `start - 1h`. Na hranici, za hranicí i po skutečném čekání na zámek křečka vrátí `400`, zachovají `PENDING_APPROVAL` a původní outbox. | **PASS** pro obě rozhodnutí, včetně kontroly původních outbox záznamů při všech odmítnutích. |
| AC-04 · nové scénáře | Nový Cancel ve třech povolených stavech na hranici uspěje a přidá oznámení vlastníkovi. Pozdní pokus nebo čekání za hranici vrátí `400` bez změny. Opakovaný Cancel po lhůtě uspěje idempotentně. | **PASS.** Stavy, adresáti a počáteční outbox ověřeny nezávislým DB dotazem. |
| Původní regrese · `npm run verify` v `check:c09` | Zachovat kolize, limit, oprávnění, souběh, atomický zápis a expiraci. | **PASS.** 30 původních scénářů a 7 regresí. |
| Build, `npm test` a smoke | Sestavení, unit a architektonické kontroly a start s PostgreSQL. | **PASS.** 10 unit testů, 4 architektonické kontroly. `node dist/index.js` odpověděl na `GET /api` a `GET /api/hamsters` vrátil katalog z DB. |

Integrační hranice je HTTP → aplikační transakce → PostgreSQL. Testy zámků potvrzují čekání přes `pg_stat_activity` a `pg_blocking_pids()`. Testy Decide a Cancel při zámku spouštějí samotnou HTTP aplikaci, takže časovač OP-06 nemění ověřovaný stav.

### CI a vydání

- **Automatizace.** [Workflow C09](../.github/workflows/c09.yml) používá čistý checkout, `npm ci`, Node.js 22.14.0 a samostatnou službu PostgreSQL 17.11. Na push a pull request spouští stejný `check:c09`. Lokální výsledek je ve výše uvedeném logu. [Běh GitHub Actions 43858548614](https://github.com/tomaskirnig/SWI_2027/actions/runs/43858548614) pro `72bcb1727df09053148f2d8c2ec1f6840cda5336` skončil `success`.
- **Kandidát RC1.** Artefakt `Kreckomat-C09-RC1.zip` má SHA-256 `89b1000858421ae4c053326755882ccd26bfcd3a071053f857c4a710eb187951`. Obsahuje sestavený runtime v `dist/`, statický frontend a oba npm manifesty. `dist/index.js` z ověřeného sestavení má SHA-256 `2a1b8a31362f41d7c06f4b57580785f75700acefeb58c265220352543959a327`. Lockfile má SHA-256 `296f77cb77325c2138e4f2cba006035a6b17381c1482e5a830eacf570ac44917`.
- **Schéma a konfigurace.** Schéma z [repository](../src/repository.ts) se inicializuje při startu bez nové migrace. Testovací konfigurace je lokální `127.0.0.1`, role `swi_c08`, DB `swi_c08_f1` a `DB_SSL=false` v izolované instanci. Návrat aplikace na původní kód obnoví původní chybu časového rozhodnutí a automaticky nevrátí už uložené rezervace ani oznámení. Případnou obnovu dat je potřeba posoudit zvlášť.
- **Nezávislý code review a čistý checkout.** `NOT RUN`. Druhý člen týmu má zrevidovat diff commitu After proti AC-01 až AC-05 a zopakovat postup z README z čistého checkoutu na stejném commitu. Do tohoto záznamu doplní jméno, datum, prověřený předpoklad, vypořádání připomínek, prostředí, příkazy, výsledky a případný blocker.
- **Pracovní stav vydání `HOLD`.** Vlastník změny Martin Kalus. Funkční ověření a lokální smoke prošly. K rozhodnutí týmu o vydání zbývá nezávislé review a reprodukce. Instalace ohlásila 6 upozornění ve stávajících závislostech. Samostatné `npm audit --omit=dev` vrátilo kód `1` a ve stromu runtime závislostí nahlásilo 1 střední, 1 vysoké a 1 kritické upozornění. Před rozhodnutím o nasazení je potřeba vyhodnotit dopad a způsob nápravy. Souhrn je v [lokálním logu](verification-c09.txt). Technický důkaz k riziku R-01 je v tabulce výše.

## C10 Provozní situace a logy

Očekávání byla zapsána před oběma běhy 18. 11. 2026. Výchozí commit `55b1216014288fe6a3727e63940fd5ab2b34c329` vrátil při výpadku z Confirm HTTP `500`, ale tento požadavek neměl vlastní diagnostický záznam. Do [Confirm](../src/app.ts) proto přibyl log technického selhání na serveru. Následující výsledky jsou z opakovaného pokusu na commitu `ce83c5bb99816bdf84f839b498044a16278e0fd8`.

Prostředí bylo Windows, Node.js 22.14.0, sestavení `npm run build`, aplikace `node dist/index.js` a čerstvá izolovaná PostgreSQL 17.11 na localhostu. Použity byly fiktivní účty a desetiminutové intervaly křečka `ferda` tři dny dopředu. Dva překrývající se návrhy byly založeny před prvním potvrzením. Stav a počet záznamů v outboxu se ověřovaly samostatným SQL čtením podle ID rezervace.

| Situace | Očekávaný a skutečný výsledek | Ověření stavu | Co ukazují logy |
|---|---|---|---|
| Úspěšné potvrzení | Create má vrátit `201 DRAFT`, Confirm `200 CONFIRMED`. **PASS**, obě odpovědi odpovídaly. | Rezervace 1 v SQL `CONFIRMED` a jeden outbox záznam. | Aplikace k operaci nevytvořila záznam. Odpověď a uložený stav stačí k prokázání úspěchu. |
| Zamítnutá kolize | Confirm druhého návrhu posunutého o 5 minut má vrátit `409`. **PASS**, API vrátilo `409`. | Rezervace 1 zůstala `CONFIRMED`. Rezervace 2 zůstala `DRAFT` s nulou outbox záznamů. | Aplikace vrátila kolizi klientovi a nezapsala ji do logu. Samostatný chybový log by zvyšoval šum. |
| Technická porucha a obnova | Confirm rezervace 3 má při zastavené DB vrátit `500` a vytvořit diagnostický záznam. Po obnově má jít potvrzení provést. **PASS**, log vznikl a po obnově prošel nový pokus s `200`. | Databáze byla zastavena pomocí `pg_ctl stop -m fast` a spuštěna nad stejným adresářem. Před opakováním samostatné SQL potvrdilo `DRAFT` a 0 záznamů. Po potvrzení bylo v DB `CONFIRMED` a 1 záznam. | V `07:27:37.545Z` Confirm zaznamenal `ECONNREFUSED` a HTTP `500`. PostgreSQL oznámila připravenost k připojení v `08:27:37.976` CET. |
| Restart aplikace | Po zastavení má HTTP přestat odpovídat. Po novém startu má původní potvrzení přežít a další Create i Confirm mají projít. **PASS**, nový proces načetl rezervaci 1 a pro rezervaci 4 vrátil `201` a `200`. | Po zastavení selhalo spojení na port aplikace. Po restartu ověřilo `GET /api/reservations/1` původní rezervaci. SQL potvrdilo rezervace 1 a 4 jako `CONFIRMED`, každou s jedním outbox záznamem. | Ukončení procesu zaznamenal testovací nástroj. Nový proces zaznamenal `Databáze připravena.` a `Křečkomat API server běží`. |

Relevantní výřez z logu aplikace při výpadku.

```json
{"timestamp":"2026-11-18T07:27:37.545Z","component":"reservation-api","operation":"confirm","errorCode":"ECONNREFUSED","httpStatus":500}
```

Pro diagnostiku mají hodnotu technické chyby a start služby. Z logu výpadku šlo určit čas, operaci, typ chyby a odpověď aplikace. Přetrvání rezervací, nepřítomnost vedlejšího zápisu při výpadku a úspěch další operace doložilo až HTTP ověření se samostatným čtením PostgreSQL.
