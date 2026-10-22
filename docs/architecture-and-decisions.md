# Architektura a rozhodnutí (Architecture and Decisions)

Zde budou zaznamenávána důležitá architektonická rozhodnutí (Architecture Decision Records - ADR) a popis technického řešení.

## Technologický stack
- **Backend:** Node.js, Express, TypeScript
- **Databáze:** PostgreSQL hostovaná na platformě Supabase (cloud DB), klientská knihovna `pg` (node-postgres)
- **Připojení k DB:** Zabezpečené SSL spojení s podporou `DATABASE_URL` a Supabase Connection Pooleru
- **Vývojové nástroje:** TypeScript compiler (`tsc`), `tsx` pro vývojový režim

## Zdůvodnění volby stacku

Node.js a Express usnadňují tvorbu rezervačního API. TypeScript pomáhá zachytit typové chyby při kompilaci.

PostgreSQL se hodí pro propojená data uživatelů, křečků a rezervací a podporuje transakce (`BEGIN ... COMMIT`, `FOR UPDATE`) pro zachování konzistence dat a ochranu proti souběhu (`REQ-07`). Knihovna `pg` umožňuje přímou práci s SQL bez další vrstvy ORM.

Pro hosting databáze byl zvolen **Supabase (spravovaný PostgreSQL v cloudu)** namísto lokální instalace. Výhodou je dostupnost pro všechny členy týmu bez nutnosti lokální správy serveru, automatické zálohy a integrovaný Connection Pooler pro efektivní správu spojení. Schéma tabulek (`hamsters`, `reservations`, `notifications_outbox`) a výchozí data jsou automaticky inicializovány aplikací při startu.

---

## Část A: AS-IS realizace scénáře Confirm Reservation

Tato část dokumentu mapuje současnou implementaci systému Křečkomat
na jeden konkrétní scénář ze Specification Baseline v0.2.

Cílem je zachytit skutečný stav aplikace (AS-IS), tedy jak dnešní
implementace realizuje scénář `Confirm Reservation`, kde je uložen
stav rezervace, kde se rozhoduje o jeho změně, kde jsou vynucována
business pravidla a na jaké technické závislosti scénář spoléhá.

Historická AS-IS analýza vychází z C02 commitu b055079. Po refaktoringu C03 zůstává dokladem původního stavu, nikoliv popisem dnešních souborů. Nevychází z návrhu
budoucí architektury.

---

## A1. Sledovaný scénář

Pro mapování byl zvolen scénář `OP-03 Confirm Reservation`.
Tento scénář je vhodný pro architektonickou analýzu, protože propojuje
HTTP API, business logiku, databázovou transakci, kontrolu invariantů,
změnu stavu rezervace a notifikační mechanismus.

V Baseline v0.2 má operace Confirm dva možné úspěšné výsledky:

- běžný křeček: `DRAFT → CONFIRMED`,
- křeček vyžadující schválení: `DRAFT → PENDING_APPROVAL`.

| Položka | Hodnota |
|---|---|
| Scénář / operace | `OP-03 Confirm Reservation` |
| Požadavky | `REQ-05`, `REQ-06`, `REQ-07` |
| Pravidla / invarianty | `BR-01`, `BR-02`, `BR-04`, `BR-05`, `BR-06`, `BR-07` |
| Baseline | `v0.2` |

### Vazba na specifikaci

`REQ-05` určuje podmínky, za kterých může být vlastní rezervace ve
stavu `DRAFT` potvrzena. Při potvrzení se znovu kontroluje čas,
aktivita křečka, konflikt rezervací a denní limit.

`REQ-06` popisuje výsledný stav a oznámení po úspěšném potvrzení,
včetně chování při selhání Notification Service.

`REQ-07` požaduje zachování zákazu překryvu a denního limitu také
při souběžných potvrzeních.

V Baseline v0.2 je tento scénář rozšířen o možnost přechodu do
`PENDING_APPROVAL`, pokud konkrétní křeček vyžaduje schválení
Správcem křečka.

## A2. Mapování hlavního průchodu scénáře na kód

Pro hlavní úspěšný průchod je sledována rezervace běžného aktivního
křečka, který nevyžaduje schválení správcem
(`requires_approval = false`).

Výsledný stavový přechod je:

`DRAFT → CONFIRMED`

| Krok scénáře z C02 | Realizace v kódu | Doklad |
|---|---|---|
| Přijmout požadavek na potvrzení | HTTP endpoint převezme ID rezervace a `user_id` a zavolá aplikační logiku potvrzení | `src/app.ts` — `POST /api/reservations/:id/confirm` |
| Načíst rezervaci a chránit ji proti souběžné změně | Je zahájena DB transakce a rezervace je načtena pomocí `SELECT ... FOR UPDATE` | `src/service.ts` — `confirmReservation()` |
| Ověřit vlastnictví a povolený výchozí stav | Systém ověří `reservation.user_id === userId` a že aktuální stav je `DRAFT` | `src/service.ts` — `confirmReservation()` |
| Ověřit časovou podmínku potvrzení | Funkce ověří, že platí `currentTime <= start - 15 min` | `src/service.ts` — `confirmReservation()`, `src/domain.ts` — `isAtLeast15MinBefore()` |
| Ověřit aktivitu křečka | Křeček je načten pomocí `SELECT ... FOR UPDATE` a kontroluje se `is_active` | `src/service.ts` — `confirmReservation()` |
| Vyhodnotit konflikt rezervací | Vyhledají se blokující rezervace stejného křečka a pomocí pravidla překryvu se zjistí případná kolize | `src/service.ts` — `findConflictingReservation()`, `src/domain.ts` — `doIntervalsOverlap()` |
| Ověřit denní limit studenta | Systém spočítá již využité minuty stejné dvojice student–křeček a ověří maximální limit 30 minut | `src/service.ts` — `checkDailyLimitExceeded()` |
| Rozhodnout výsledný stav | Podle `hamster.requires_approval` se zvolí `CONFIRMED` nebo `PENDING_APPROVAL`; v tomto hlavním průchodu je výsledkem `CONFIRMED` | `src/service.ts` — `confirmReservation()` |
| Uložit změnu stavu a požadavek na oznámení | Stav rezervace je aktualizován a do `notifications_outbox` je vložen záznam oznámení | `src/service.ts` — `confirmReservation()` |
| Potvrdit business změnu | Databázová transakce je ukončena pomocí `COMMIT` | `src/service.ts` — `confirmReservation()` |
| Předat oznámení | Po `COMMIT` je zavolána notifikační integrace pomocí `sendNotification()`; výsledek doručení se eviduje jako`SENT` nebo `FAILED`. | `src/service.ts` — `confirmReservation()`, `src/notification.ts` — `sendNotification()` |
| Vrátit výsledek volajícímu | Service vrátí ID a výsledný stav, HTTP endpoint jej předá klientovi jako JSON | `src/service.ts` — `confirmReservation()`, `src/app.ts` — endpoint Confirm |

### Poznámka k Baseline v0.2

Současná implementace obsahuje v rámci stejné operace také druhý
úspěšný průchod pro křečka, který vyžaduje schválení:

`DRAFT → PENDING_APPROVAL`

Rozhodnutí je realizováno přímo v `confirmReservation()`:

`hamster.requires_approval ? 'PENDING_APPROVAL' : 'CONFIRMED'`

`PENDING_APPROVAL` je následně při kontrolách konfliktu a denního
limitu považován za blokující stav stejně jako `CONFIRMED`.

## A3. Alternativní větev — konflikt rezervací

Jako důležitá alternativní větev scénáře `Confirm Reservation`
je sledován případ, kdy se od vytvoření návrhu `DRAFT` objeví
jiná blokující rezervace stejného křečka ve stejném časovém intervalu.

V takovém případě nesmí původní návrh přejít do potvrzeného stavu.

| Co říká v0.2 | Kde se podmínka zjistí | Kde se rozhodne výsledek | Co dostane volající |
|---|---|---|---|
| Překryv s blokující rezervací stejného křečka → potvrzení odmítnout | `src/service.ts` — `findConflictingReservation()` načte rezervace ve stavech `CONFIRMED` a `PENDING_APPROVAL`; vlastní překryv vyhodnotí `src/domain.ts` — `doIntervalsOverlap()` | `src/service.ts` — `confirmReservation()` testuje výsledek `conflict` a při nalezené kolizi vyhodí chybu se stavem `409` | HTTP `409 Conflict` s JSON odpovědí obsahující popis kolize |

### Průchod chybovou větví

1. `POST /api/reservations/:id/confirm` přijme požadavek na potvrzení.
2. `confirmReservation()` zahájí databázovou transakci.
3. Rezervace je načtena pomocí `SELECT ... FOR UPDATE`.
4. Systém ověří vlastníka, stav `DRAFT`, čas a aktivitu křečka.
5. `findConflictingReservation()` načte blokující rezervace stejného
   křečka ve stavech `CONFIRMED` a `PENDING_APPROVAL`.
6. `doIntervalsOverlap()` zjistí, zda se některý interval překrývá
   s intervalem potvrzovaného návrhu.
7. Pokud konflikt existuje, `confirmReservation()` vyhodí chybu
   se stavem `409`.
8. `catch` v `confirmReservation()` provede `ROLLBACK`.
9. Rezervace proto zůstává ve svém původním stavu `DRAFT`.
10. HTTP endpoint v `src/app.ts` převede chybu na odpověď klientovi.

Příklad chybové odpovědi:

```json
{
  "error": "Nelze potvrdit: vznikla kolize s potvrzenou rezervací ID ...",
  "offerTimeShift": false
}
```
## A4. Hlavní části implementace

Pro scénář `Confirm Reservation` byly identifikovány následující
hlavní části současné implementace. Bloky jsou popsány na úrovni
logických modulů aplikace.

| Část implementace | Typ / obsah | Role v tomto scénáři | Doklad |
|---|---|---|---|
| `Reservation API` | HTTP/API modul — `src/app.ts` | Přijme požadavek na potvrzení, získá `reservationId`, `user_id` a aktuální čas a předá řízení business logice. Výsledek nebo chybu převádí na HTTP odpověď. | `src/app.ts` — `POST /api/reservations/:id/confirm` |
| `Reservation Service` | aplikační/business modul — `src/service.ts` | Řídí celý scénář Confirm: transakci, načtení rezervace a křečka, ověření pravidel, rozhodnutí výsledného stavu, změnu stavu a vytvoření outbox záznamu. | `src/service.ts` — `confirmReservation()` |
| `Domain Rules` | doménové funkce — `src/domain.ts` | Realizuje opakovaně použitelná business pravidla, například časovou hranici 15 minut, překryv intervalů a výpočet minut pro denní limit. | `src/domain.ts` — `isAtLeast15MinBefore()`, `doIntervalsOverlap()`, `calculateMinutesPerDay()` |
| `PostgreSQL Persistence` | PostgreSQL + SQL volání přes `pg` | Trvale ukládá rezervace, křečky a outbox oznámení. Poskytuje transakce a `FOR UPDATE`, které scénář využívá pro ochranu proti souběhu. | `src/service.ts` — SQL v `confirmReservation()`, `findConflictingReservation()`, `checkDailyLimitExceeded()`; databázové připojení v `src/db.ts` |
| `Notification Integration` | integrační modul — `src/notification.ts` | Po úspěšném potvrzení business změny se pokusí doručit oznámení. Selhání doručení nevrací rezervaci zpět a je evidováno v outboxu. | `src/notification.ts` — `sendNotification()`, `src/service.ts` — část po `COMMIT` |

### Pozorování současné struktury

Současná implementace nemá samostatnou repository vrstvu.
SQL dotazy a řízení databázové transakce jsou součástí
`src/service.ts`.

`confirmReservation()` proto v současném AS-IS řešení kombinuje
několik odpovědností:

- orchestrace scénáře;
- business rozhodování;
- práce s databází a transakcí;
- změna stavu rezervace;
- vytvoření outbox záznamu;
- spuštění notifikační integrace.

Doménová pravidla, která jsou použitelná i v jiných scénářích,
jsou částečně oddělena do `src/domain.ts`.

## A5. Stav, změna stavu a business pravidlo

### Stav

| Otázka | Odpověď | Doklad |
|---|---|---|
| Kde je stav `Reservation` trvale uložen? | V PostgreSQL databázi v tabulce `reservations`, ve sloupci `status`. | `src/service.ts` — vytvoření tabulky `reservations` v `initializeDatabase()` |
| Který kód rozhoduje/provádí přechod použitý ve scénáři? | `confirmReservation()` v `src/service.ts`. Funkce podle vlastností křečka rozhodne mezi `CONFIRMED` a `PENDING_APPROVAL` a následně nový stav uloží pomocí SQL `UPDATE`. | `src/service.ts` — `confirmReservation()` |

V hlavním sledovaném průchodu běžného křečka probíhá změna:

`DRAFT → CONFIRMED`

Pro křečka vyžadujícího schválení probíhá:

`DRAFT → PENDING_APPROVAL`

Rozhodnutí je v současné implementaci provedeno výrazem:

```ts
const targetStatus: ReservationStatus =
  hamster.requires_approval ? 'PENDING_APPROVAL' : 'CONFIRMED';
```
### Business pravidlo / invariant — BR-02

Pro sledovaný scénář bylo zvoleno pravidlo `BR-02`,
které zakazuje překrývající se blokující rezervace stejného křečka.

| Otázka | Odpověď | Doklad |
|---|---|---|
| Kde se zjistí podmínka pravidla? | `findConflictingReservation()` načte blokující rezervace stejného křečka a `doIntervalsOverlap()` vyhodnotí překryv intervalů. | `src/service.ts` — `findConflictingReservation()`; `src/domain.ts` — `doIntervalsOverlap()` |
| Kde se podle výsledku rozhodne? | `confirmReservation()` kontroluje výsledek `conflict`. Při nalezené kolizi vyhodí chybu se stavem `409`. | `src/service.ts` — `confirmReservation()` |
| Kde se provede výsledná změna stavu? | Pokud konflikt neexistuje a projdou ostatní kontroly, `confirmReservation()` uloží nový stav rezervace pomocí SQL `UPDATE`. | `src/service.ts` — `confirmReservation()` |

### Ochrana při souběhu

`Confirm Reservation` probíhá uvnitř databázové transakce.
Rezervace i příslušný křeček jsou načítáni pomocí
`SELECT ... FOR UPDATE`.

Tím současná implementace serializuje konfliktní potvrzování
rezervací stejného křečka a podporuje zachování `BR-02`
také při souběžných požadavcích.

Při chybě se provede `ROLLBACK`, při úspěchu `COMMIT`.

## A6. Relevantní závislosti

Pro scénář `Confirm Reservation` jsou v současné implementaci
relevantní především databáze PostgreSQL a notifikační integrace.

| Závislost | Kde se napojuje na náš kód | Která část zná její technické API | Doklad |
|---|---|---|---|
| PostgreSQL databáze | `confirmReservation()` načítá a mění rezervaci, načítá křečka, kontroluje konflikty a denní limit a zapisuje outbox | `src/service.ts` používá SQL a databázového klienta; `src/db.ts` poskytuje připojení přes `pool` | `src/service.ts` — `confirmReservation()`, `findConflictingReservation()`, `checkDailyLimitExceeded()`; `src/db.ts` |
| Notification Service / notifikační integrace | Po úspěšném `COMMIT` se `confirmReservation()` pokusí předat oznámení pomocí `sendNotification()` | `src/notification.ts` zapouzdřuje technický mechanismus odeslání; `src/service.ts` zná pouze funkci `sendNotification()` | `src/notification.ts` — `sendNotification()`; `src/service.ts` — `confirmReservation()` |
| Notifications outbox | Je uložen ve stejné PostgreSQL databázi a eviduje požadované oznámení a stav jeho doručení | `src/service.ts` přímo zapisuje a aktualizuje tabulku `notifications_outbox` | `src/service.ts` — `confirmReservation()`, `initializeDatabase()` |

### PostgreSQL

PostgreSQL není v tomto scénáři pouze úložištěm dat.
Současná implementace využívá také jeho transakční mechanismus:

- `BEGIN`;
- `SELECT ... FOR UPDATE`;
- `UPDATE`;
- `COMMIT`;
- při chybě `ROLLBACK`.

Databáze proto v současném AS-IS řešení podporuje nejen perzistenci
stavu, ale také ochranu business pravidel při souběžném potvrzování.

### Notification Service

Notifikační část je v současné implementaci oddělena pomocí funkce
`sendNotification()` v `src/notification.ts`.

Business změna rezervace je nejprve potvrzena v databázi a teprve
potom se systém pokusí oznámení doručit.

Pokud doručení selže:

- změna rezervace se nevrací zpět;
- outbox záznam dostane stav `FAILED`;
- volající obdrží varování.

Toto chování odpovídá požadavku, že selhání oznámení nesmí zrušit
již úspěšné potvrzení rezervace.

### Identita uživatele

Samostatný externí IdP není v současné implementaci scénáře
`Confirm Reservation` napojen.

Identita studenta je do endpointu předávána prostřednictvím
`user_id` v HTTP požadavku a `confirmReservation()` pouze porovnává
tuto hodnotu s `reservation.user_id`.

Proto IdP není součástí současného AS-IS diagramu. Jeho konkrétní
integrace zůstává mimo rozsah současné implementace.


## A7. AS-IS strukturální diagram

Následující diagram zachycuje současnou realizaci scénáře
`Confirm Reservation`. Nejde o cílovou architekturu, ale o skutečnou
strukturu implementace vzniklé v C02.

```text
                         HTTP confirm request
                                |
                                v
+--------------------------- Application code ----------------------------+
|                                                                         |
|  +-----------------------+                                              |
|  | Reservation API       |                                              |
|  | src/app.ts            |                                              |
|  | přijme confirm request|                                              |
|  +-----------+-----------+                                              |
|              | confirmReservation(id, userId, now)                      |
|              v                                                          |
|  +-----------------------+                                              |
|  | Reservation Service   |----------------------+                       |
|  | src/service.ts        |                      |                       |
|  | řídí Confirm          |                      |                       |
|  +-----+------------+----+                      |                       |
|        |            |                           |                       |
|        | použije    | sendNotification()        | SQL / transaction     |
|        v            v                           |                       |
|  +-------------+  +-------------------------+   |                       |
|  | Domain Rules|  | Notification Integration|  |                       |
|  | domain.ts   |  | notification.ts         |  |                       |
|  | čas, overlap|  | pokus o doručení        |  |                       |
|  | denní limit |  +-------------------------+  |                       |
|  +-------------+                               |                       |
|                                                |                       |
+------------------------------------------------|-----------------------+
                                                 |
                                                 | SELECT / UPDATE /
                                                 | INSERT / FOR UPDATE /
                                                 | COMMIT / ROLLBACK
                                                 v
                                      +-----------------------+
                                      | PostgreSQL database   |
                                      | reservations          |
                                      | hamsters              |
                                      | notifications_outbox  |
                                      +-----------------------+
```
                                    


---



## A8. Otázka pro další architektonický návrh

| Položka | Obsah |
|---|---|
| **Otázka** | Jak oddělit orchestraci a business logiku potvrzení rezervace od přímého psaní SQL dotazů a nízkoúrovňové správy databázových transakcí (např. zavedením Repository vzoru a Unit of Work), aby byl kód čistě testovatelný bez nutnosti živé PostgreSQL databáze a snížila se vysoká provázanost v `Reservation Service`? |
| **Doklad** | `src/service.ts` — funkce `confirmReservation()`, `findConflictingReservation()` a `checkDailyLimitExceeded()` přímo v sobě sestavují a provádějí raw SQL dotazy (`client.query('SELECT ... FOR UPDATE')`, `client.query('UPDATE ...')`, `BEGIN`, `COMMIT`, `ROLLBACK`), spravují klienta z poolu a současně vyhodnocují doménová pravidla a připravují outbox. Jak bylo uvedeno v sekci A4, v současné implementaci zcela chybí samostatná perzistenční vrstva (Repository). |
| **Proč je důležitá** | V současném AS-IS stavu lze sice čisté doménové funkce v `domain.ts` (např. výpočet intervalů a překryvů) testovat bez databáze, avšak aplikační orchestrace a perzistence jsou pevně svázány s konkrétním ovladačem PostgreSQL a raw SQL dotazy v `service.ts`. To brání psaní rychlých izolovaných testů pro kompletní službový scénář bez nutnosti živé PostgreSQL, porušuje princip jedné odpovědnosti (SRP) a činí jakoukoliv budoucí úpravu schématu či transakcí náročnou na údržbu v navazujících krocích C03 a CP1. |

---

# Část B: Architektonické drivery

Zpřesnění 4 klíčových driverů podložených požadavky, pravidly a nálezy z Části A:

| Podklad / zdroj | Proč ovlivňuje architekturu | Otázka, kterou musí architektura vyřešit |
|---|---|---|
| `BR-02`, `REQ-04`, `REQ-07`, Part A (A2, A3) | Dva souběžné požadavky mohou v tentýž okamžik vidět termín jako volný; bez přísné transakční izolace hrozí dvojí rezervace a porušení invariantu exkluzivity. | Kde a jak se musí provést autoritativní confirmation decision, aby `BR-02` zůstalo pravdivé i při souběhu? |
| `REQ-10`, `REQ-13`, `BR-03`, Part B baseline v0.2 | Rozhodnutí správce přichází asynchronně s časovou prodlevou; stav `PENDING_APPROVAL` musí přežít konec requestu a při nečinnosti musí v čase `start - 1h` spolehlivě proběhnout expirace. | Kdo vlastní stav čekajícího schválení a kdo provede pozdější přechod do `CONFIRMED`, `REJECTED` či `EXPIRED`? |
| `REQ-06`, `BR-06`, Part A (A2) | `Notification Service` je externí nespolehlivá služba; selhání doručení nesmí zvrátit již provedenou a commitnutou business změnu v databázi. | Má selhání notifikace ovlivnit úspěch potvrzení rezervace a kde má být izolována integrace a správa outboxu? |
| Part A nález A8, `src/service.ts`, `src/domain.ts` | V AS-IS implementaci je orchestrace srostlá s raw SQL dotazy a přímým řízením transakcí, což ztěžuje unit testování business scénářů bez PostgreSQL databáze. | Jak strukturálně oddělit doménovou logiku potvrzení od perzistence a databázových transakcí? |

---

# Část C1: Doménový třídní model

Doménový model zachycuje klíčové doménové pojmy pro scénář potvrzení rezervace a schvalovací proces bez závislostí na frameworku, kontrolerech či perzistenci:

```mermaid
classDiagram
    class Reservation {
        +int id
        +string userId
        +string hamsterId
        +TimeInterval interval
        +ReservationStatus status
        +DateTime createdAt
        +confirm(currentTime)
        +cancel(currentTime)
        +approve(managerId, currentTime)
        +reject(managerId, currentTime)
        +expire(currentTime)
    }

    class ReservationStatus {
        <<enumeration>>
        DRAFT
        CONFIRMED
        PENDING_APPROVAL
        CANCELLED
        REJECTED
        EXPIRED
    }

    class Hamster {
        +string id
        +string name
        +boolean isActive
        +boolean requiresApproval
        +canBeReserved() boolean
    }

    class Student {
        +string id
        +string name
        +hasDailyLimitCapacity(date, duration) boolean
    }

    class Manager {
        +string id
        +string name
        +canDecideReservation(hamsterId) boolean
    }

    class TimeInterval {
        +DateTime start
        +DateTime end
        +durationMinutes() int
        +overlapsWith(TimeInterval other) boolean
        +isAtLeast15MinBefore(DateTime currentTime) boolean
    }

    class ApprovalDecision {
        +string managerId
        +DecisionType decision
        +DateTime decidedAt
        +string reason
    }

    class DecisionType {
        <<enumeration>>
        APPROVE
        REJECT
    }

    class NotificationMessage {
        +int id
        +string recipient
        +string subject
        +string body
        +NotificationStatus status
        +DateTime createdAt
    }

    Reservation "1" --> "1" TimeInterval : vymezeno v čase
    Reservation "1" --> "1" ReservationStatus : má aktuální stav
    Student "1" --> "*" Reservation : zakládá a potvrzuje
    Hamster "1" --> "*" Reservation : je předmětem rezervace
    Reservation "0..1" --> "0..1" ApprovalDecision : zaznamenává posouzení
    Manager "1" --> "*" ApprovalDecision : autoritativně rozhoduje
    Reservation "1" --> "*" NotificationMessage : generuje požadavky na oznámení
```

**Klíčové doménové invarianty:**
- **BR-01:** Polouzavřený interval `[start, end)`.
- **BR-02:** Jeden křeček nesmí mít dva překrývající se intervaly se stavy `CONFIRMED` nebo `PENDING_APPROVAL`.
- **BR-03:** Potvrzení a storno nejpozději 15 minut před začátkem (`currentTime <= start - 15 min`). Rozhodnutí správce pouze při `currentTime < start - 1h`.
- **BR-04:** Dvojice student–křeček má maximálně 30 minut rezervací v jednom kalendářním dni (počítají se `CONFIRMED` a `PENDING_APPROVAL`).
- **BR-07:** Rezervovat a schválit lze pouze aktivního křečka (`isActive = true`).

---

# Část C2: Odpovědnosti systému

| Zdroj | Odpovědnost | Co musí rozhodovat / vlastnit | Potřebuje 1 jasného vlastníka? | Důvod | S čím musí být seskupena | Od čeho má být oddělena |
|---|---|---|:---:|---|---|---|
| Confirm + statechart | Rozhodnout o platnosti potvrzení a cílovém stavu | Přechod `DRAFT → CONFIRMED` nebo `DRAFT → PENDING_APPROVAL` | Ano | Různé části nesmí rozhodnout odlišně; rozhodnutí musí být autoritativní. | S kontrolou časové lhůty (`BR-03`) a příznakem schvalování křečka. | Od HTTP routování, formátování JSON a přímého odesílání e-mailů. |
| `BR-02`, `REQ-07` | Vyhodnotit konflikt a zachovat invariant | Detekce překryvu intervalů v transakčním zámku | Ano | Souběh dvou potvrzení nesmí porušit exkluzivitu alokace křečka. | S atomickou perzistencí a zamykáním řádků v transakci. | Od uživatelského rozhraní a notifikačního mechanismu. |
| `BR-04` | Kontrola a výpočet denního limitu | Agregace minut a vyhodnocení nepřekročení 30 min denně | Ano | Invariant denního limitu studenta nesmí být obcházen souběhem. | S doménovou logikou časových intervalů v kalendářním dni. | Od nízkoúrovňového SQL driveru. |
| Approval change (`REQ-10`–`REQ-12`) | Správa čekajícího schválení | Stav `PENDING_APPROVAL`, provedení Approve/Reject správcem | Ano | Stav žádosti přežívá request studenta a vyžaduje autorizaci správce. | S doménovými pravidly role správce a kontrolou lhůty `start - 1h`. | Od běžného studentského rezervačního toku. |
| Expiration (`REQ-13`, `REQ-14`) | Hlídání a provádění expirace | Přechod `PENDING_APPROVAL → EXPIRED` při `currentTime >= start - 1h` | Ano | Uvolňuje zablokovaného křečka i studentův limit při nečinnosti správce. | Se schvalovacím životním cyklem. | Od synchronního zpracování příchozích HTTP requestů. |
| Persistence (`A8`) | Atomické uložení a čtení dat | Transakční hranice (`BEGIN`, `COMMIT`, `ROLLBACK`), načítání entit | Ano | Zajišťuje trvalost a konzistenci datového modelu. | S databázovým adaptérem (Repository). | Od čisté business logiky doménových pravidel. |
| Notification (`BR-06`, `REQ-06`) | Příprava a spolehlivé doručení oznámení | Zápis outbox zprávy v transakci a následné předání odesílači | Podle návrhu | Externí selhání nesmí narušit uložený business stav rezervace. | S transakčním outbox úložištěm. | Od hlavní business logiky schválení či potvrzení. |

---

# Část D: Hlavní rozhodovací otázka

```text
Rozhodovací otázka:
Kde a jak má být vlastněn delayed approval workflow a časovač expirací nerozhodnutých žádostí?
```

---

# Část E1: Dvě materiálně odlišné alternativy

```text
Alternativa A — In-process modul uvnitř stejného deployable

+-------------------------------------------------------------------+
| [Reservation Application] (jediný Node.js proces)                  |
|   ├─ [Reservation Management] (přijetí požadavku, přechody DRAFT) |
|   ├─ [Approval Workflow] (správa PENDING_APPROVAL, Approve/Reject)|
|   └─ [In-Process Expiry Timer] (periodická kontrola start - 1h)   |
+-------------------------------------------------------------------+
                                  |
                                  v
                            [PostgreSQL]
```

```text
Alternativa B — Samostatný runtime worker proces

+-------------------------------------+
| [Reservation Application]           |
| (HTTP REST API proces)              |
|   └─ [Reservation Management]       |
+-------------------------------------+
                 |
                 v
           [PostgreSQL] <-------------+
                                      | čtení/zápis expirací
+-------------------------------------+
| [Approval & Expiry Worker]          |
| (samostatný background proces / cron)|
|   └─ [Worker / Scheduler Engine]    |
+-------------------------------------+
```

---

# Část E2: Porovnání alternativ vůči driverům

| Driver / kritérium | Alternativa A (In-process modul) | Alternativa B (Samostatný runtime worker) |
|---|---|---|
| **Konzistence a invarianty (`BR-02`, `BR-03`)** | Kontrola v témže procesu, standardně každých 30 s; zámky stejné DB transakce chrání jediný přechod. Expirace nastane při nejbližší kontrole po hranici. | Stejné transakční zámky; samostatný worker také kontroluje periodicky. Prodleva závisí na nastaveném intervalu, nikoliv pouze na počtu procesů. |
| **Chování při selhání (Failure behaviour)** | Pokud spadne aplikační proces, zastaví se i časovač; po restartu však první kontrola okamžitě zpracuje všechny expirované žádosti (idempotentní restart recovery). | Pád webového serveru neovlivní worker expirací; pád workeru neovlivní HTTP API. Vyžaduje však samostatný monitoring dvou běžících služeb. |
| **Změna / ownership** | Jednotná codebase a sdílené doménové entity; změna pravidel expirace či schválení je na jednom místě; nižší režie vývoje. | Přísná procesní izolace; nutnost sdílet doménový kód/knihovnu mezi dvěma procesy nebo komunikovat přes interní API / DB kontrakt. |
| **Provozní složitost** | Nízká; jeden proces, jedno nasazení, nulová nutnost externího orchestrátoru procesů; ideální pro prototyp a cvičení. | Vyšší; vyžaduje správu více procesů (Docker compose, PM2, Kubernetes cronjob), složitější CI/CD pipeline a lokální debugování. |

---

# Část E3: Scénářový walkthrough obou alternativ

Sledovaný scénář: `Confirm Reservation` pro křečka vyžadujícího schválení (*Archimedes*), následovaný nečinností správce a automatickou expirací žádosti v čase `start - 1h`:

| Krok / událost | Alternativa A (In-process modul) | Alternativa B (Samostatný runtime worker) |
|---|---|---|
| 1. Student odešle `Confirm` | Express endpoint zavolá `Reservation Management`. | Express endpoint zavolá `Reservation Management`. |
| 2. Zjištěna potřeba schválení | Služba v transakci ověří pravidla a nastaví `status = PENDING_APPROVAL`, zapíše notifikaci pro správce do outboxu. | Služba v transakci ověří pravidla a nastaví `status = PENDING_APPROVAL`, zapíše notifikaci pro správce do outboxu. |
| 3. Ukončení iniciačního requestu | Transakce commitnuta; student obdrží HTTP `200 OK` se stavem `PENDING_APPROVAL`. Spojení se ukončí. | Transakce commitnuta; student obdrží HTTP `200 OK` se stavem `PENDING_APPROVAL`. Spojení se ukončí. |
| 4. Správce v čase nereaguje | Rezervace trvale perzistována v PostgreSQL v mezistavu; dočasně blokuje křečka i denní limit. | Rezervace trvale perzistována v PostgreSQL v mezistavu; dočasně blokuje křečka i denní limit. |
| 5. Čas dosáhne hranice `start - 1h` | Interní in-process časovač detekuje překročení hranice při nejbližším ticku, spustí doménovou expiraci. | Samostatný worker proces při svém běhu/polling cyklu detekuje překročení hranice v DB a spustí expiraci. |
| 6. Zpracování expirace a uvolnění | V transakci nastaven stav `EXPIRED`, uvolněn termín i limit, vygenerována notifikace oběma stranám do outboxu. | V transakci nastaven stav `EXPIRED`, uvolněn termín i limit, vygenerována notifikace oběma stranám do outboxu. |
| 7. Souběžný pokus správce o schválení | Transakční zámek `SELECT FOR UPDATE` zajistí, že buď zvítězí expirace a schválení je odmítnuto, nebo naopak. | Transakční zámek v DB zajistí stejný atomický výsledek i při souběhu oddělených procesů. |

---

# Část F: Architektonické rozhodnutí (ADR)

## ADR-01 — Umístění a vlastnictví delayed approval workflow a časovače expirací

- **Kontext:**  
  V Baseline v0.2 některé rezervace přecházejí do stavu `PENDING_APPROVAL`, kde čekají na manuální rozhodnutí správce křečka. Pokud správce nerozhodne do času `start - 1h`, systém musí žádost automaticky převést do stavu `EXPIRED` a uvolnit alokaci i limit. Současně je vyžadováno spolehlivé chování při souběhu a minimální provozní režie.

- **Drivery:**  
  - Zachování invariantů `BR-02` a `BR-03` při souběhu a v čase.
  - Asynchronní správa stavu přesahující životnost HTTP požadavku.
  - Spolehlivost a obnova po výpadku (restart recovery).
  - Přiměřenost provozní složitosti pro demonstrační a akademické nasazení.

- **Alternativa A:**  
  In-process modul uvnitř stejného Node.js deployable s neblokujícím časovačem a ručně vyvolatelným obslužným endpointem.

- **Alternativa B:**  
  Samostatný runtime proces / worker oddělený od webové aplikace.

- **Rozhodnutí:**  
  Přijata **Alternativa A** — delayed approval workflow i časovač expirací jsou organizovány jako samostatný doménový modul `Approval Workflow` uvnitř stejného monolitického Node.js procesu, napojený na společnou PostgreSQL databázi. Modul je navržen s jasným rozhraním, které umožní budoucí fyzické vyčlenění do samostatného workeru bez změny doménové logiky.

- **Důvod:**  
  Alternativa A splňuje všechny požadavky na transakční bezpečnost a zachování invariantů při dramaticky nižší provozní složitosti. Confirm, Cancel, Decide a Expire používají repository.withTransaction a řádkové zámky. Změna stavu i požadavek na oznámení patří do stejné transakce. Při restartu aplikace je zajištěna okamžitá obnova, kdy úvodní běh zpracuje všechny expirované žádosti.

- **Přijaté negativní důsledky:**  
  Při úplném pádu jediného Node.js procesu se hlídání expirací dočasně pozastaví, dokud proces nenastartuje znovu. Časovač sdílí výpočetní zdroje s HTTP serverem (v daném měřítku systému zanedbatelné).

- **Rozhodnutí znovu otevřeme, když:**  
  Zátěž systému vzroste natolik, že kontrola expirací začne ovlivňovat latenci HTTP požadavků, nebo pokud bude vyžadováno horizontální škálování webové vrstvy na více instancí (kde je třeba posoudit náklady více timerů; správnost přechodů nadále chrání databázové zámky).

---

# Část G1: Kontext systému

```mermaid
flowchart LR
    Student[Student] -->|Create, Availability, Confirm, Cancel| System[Křečkomat]
    Manager[Správce křečka] -->|Approve, Reject, ruční Expire| System
    System -->|čtení a uložení rezervací a outboxu| DB[(PostgreSQL)]
```

Notification Service je v prototypu simulovaná přes `NotificationSender` uvnitř aplikace. Externí SMTP/HTTP provider není zapojený. Availability je veřejný čtecí dotaz; identita studenta a role správce jsou pro demonstrační změnové operace předávané klientem.

# Část G2: Přijatá statická architektura

```mermaid
flowchart TD
    subgraph System[Křečkomat]
        API["HTTP API: app.ts"]
        RM["Reservation Management: service.ts<br/>owns: Create, Confirm, Cancel"]
        AW["Approval Workflow: service.ts<br/>owns: Decide, Expire"]
        AV["Availability: service.ts<br/>owns: veřejné čtecí dotazy"]
        Policy["ConfirmationPolicy: domain.ts<br/>owns: podmínky a výsledek potvrzení"]
        Repo["Repository: repository.ts<br/>owns: SQL, transakce, zámky, uložení outboxu"]
        Notif["Notification Integration: notification.ts<br/>owns: simulovaný pokus o předání"]
    end
    DB[(PostgreSQL)]
    API -->|Create, Confirm, Cancel| RM
    API -->|Decide, Expire| AW
    API -->|Availability| AV
    RM -->|evaluate| Policy
    RM -->|withTransaction, čtení, zápisy| Repo
    AW -->|withTransaction, čtení, zápisy| Repo
    AV -->|čtení| Repo
    RM -->|sendNotification po COMMIT| Notif
    Repo -->|SQL| DB
```

Logické prvky Reservation Management, Approval Workflow a Availability jsou skupiny funkcí v jednom modulu `service.ts`, nikoli tři dodatečné třídy. `ConfirmationPolicy` je skutečná třída. Služba určuje rozsah business operace a přes `withTransaction(callback)` předává repository její transakční tělo. Repository vlastní technické BEGIN/COMMIT/ROLLBACK i uvolnění klienta. Policy nerozhoduje autorizaci a neprovádí I/O.

Požadavek na oznámení se ukládá do outboxu ve stejné transakci jako změna rezervace. Po Confirm a novém Cancel následuje jeden pokus přes simulovaný odesílač; služba zaznamená SENT/FAILED a případné varování. Oznámení správci, výsledek Decide a zprávy Expire zůstávají PENDING. Background dispatcher ani automatický retry nejsou implementované a nejsou slibem této verze.

# Část G3: Ownership přechodů

| Přechod | Owner rozhodnutí | Kdo jej vyžádá | Podmínka |
|---|---|---|---|
| vznik → DRAFT | Reservation Management | Student | Platný interval, aktivita, předstih, předběžná dostupnost a limit |
| DRAFT → CONFIRMED | Reservation Management s ConfirmationPolicy | Student | BR-01 až BR-05, BR-07; křeček nevyžaduje schválení |
| DRAFT → PENDING_APPROVAL | Reservation Management s ConfirmationPolicy | Student | Stejná kontrola; křeček vyžaduje schválení |
| PENDING_APPROVAL → CONFIRMED | Approval Workflow | Správce | Aktivní křeček, oprávněná role, currentTime < start - 1h |
| PENDING_APPROVAL → REJECTED | Approval Workflow | Správce | Oprávněná role, currentTime < start - 1h |
| PENDING_APPROVAL → EXPIRED | Approval Workflow | Timer nebo ruční endpoint | currentTime >= start - 1h, řádek stále čeká pod zámkem |
| DRAFT / CONFIRMED / PENDING_APPROVAL → CANCELLED | Reservation Management | Vlastník | currentTime <= start - 15 min |
| CANCELLED → CANCELLED | Reservation Management | Vlastník | Idempotentní odpověď, žádný nový přechod ani oznámení |

Rozhodnutí o přechodu je vždy pod zámkem příslušné rezervace. Confirm navíc zamyká křečka kvůli konfliktům a dennímu limitu. Expire vybírá čekající řádky pomocí stejného klienta a `FOR UPDATE` jako následné změny; souběžný Cancel nebo další Expire nemůže přepsat dokončený přechod.

# Část G4: Runtime / deployment mapping

```mermaid
flowchart TD
    subgraph Process[Node.js proces]
        API[Express HTTP server]
        Service["service.ts: Reservation Management, Approval Workflow, Availability"]
        Policy["domain.ts: ConfirmationPolicy a časové funkce"]
        Timer["index.ts: kontrola při startu a intervalový timer"]
        Repo["repository.ts + db.ts: SQL, transakce, pg pool"]
        Stub["notification.ts: simulovaný NotificationSender"]
        API --> Service
        Timer -->|expirePendingReservations| Service
        Service --> Policy
        Service --> Repo
        Service -->|pokus po Confirm/Cancel| Stub
    end
    Repo -->|pg spojení| DB[(PostgreSQL: reservations, hamsters, notifications_outbox)]
```

Standardní interval kontroly expirace je 30 000 ms, měnitelný přes `EXPIRY_CHECK_INTERVAL_MS`. Hranice způsobilosti je `start - 1h`; skutečný přechod nastane při nejbližší dokončené kontrole. Po restartu se kontrola provede před spuštěním HTTP serveru. Externí notifikační runtime v této verzi neběží.

# Část H1: Návrhová sekvence Confirm Reservation

```mermaid
sequenceDiagram
    actor Student
    participant API as app.ts
    participant Svc as Reservation Management
    participant Repo as IReservationRepository
    participant Policy as ConfirmationPolicy
    participant DB as PostgreSQL
    participant Notif as Notification Integration (stub)
    Student->>API: POST /api/reservations/:id/confirm
    API->>Svc: confirmReservation(id, userId, now)
    Svc->>Repo: withTransaction(callback)
    Repo->>DB: BEGIN
    Note over Svc,Repo: Následuje tělo callbacku se stejným klientem
    Svc->>Repo: findReservationByIdForUpdate(client, id)
    Repo->>DB: SELECT reservation FOR UPDATE
    Svc->>Svc: ověřit existenci a vlastníka
    Svc->>Repo: findHamsterByIdForUpdate(client, hamsterId)
    Repo->>DB: SELECT hamster FOR UPDATE
    Svc->>Repo: findActiveReservationsForHamster(client, hamsterId, id)
    Svc->>Repo: findUserReservationsForHamster(client, userId, hamsterId, id)
    Svc->>Svc: sestavit mapu minut po pražských dnech
    Svc->>Policy: evaluate(candidate, hamster, slots, minutes, now)
    alt Neplatná podmínka
        Policy-->>Svc: ok=false, code, message
        Svc-->>Repo: callback vyhodí chybu
        Repo->>DB: ROLLBACK
        API-->>Student: 409 pro kolizi, jinak 400
    else Podmínky splněny
        Policy-->>Svc: ok=true, targetStatus
        Svc->>Repo: updateReservationStatus(client, id, targetStatus)
        Svc->>Repo: insertOutboxNotification(client, id, student, message)
        opt PENDING_APPROVAL
            Svc->>Repo: insertOutboxNotification(client, id, správce, message)
        end
        Repo->>DB: COMMIT
        Note over Svc,Repo: Transakční klient je uvolněn
        Svc->>Notif: sendNotification(student, message)
        Svc->>Repo: updateOutboxStatus(id, SENT nebo FAILED)
        API-->>Student: 200, id, targetStatus, případně warning
    end
```

Neexistující rezervace/křeček a cizí vlastník se odmítají samostatně 404/403. Selhání simulovaného odesílače probíhá až po COMMIT a změnu rezervace nevrací zpět.

# Část H2: Zaměřený návrhový třídní / modulový pohled

```mermaid
classDiagram
    class ReservationOperations {
        <<module>>
        +confirmReservation(id, userId, now)
        +cancelReservation(id, userId, now)
        +decideReservation(id, role, decision, now)
        +expirePendingReservations(now)
    }
    class IReservationRepository {
        <<interface>>
        +withTransaction(callback)
        +findReservationByIdForUpdate(client, id)
        +findHamsterByIdForUpdate(client, id)
        +findActiveReservationsForHamster(client, hamsterId, excludeId)
        +findUserReservationsForHamster(client, userId, hamsterId, excludeId)
        +findPendingReservationsBeforeTimeForUpdate(client, cutoff)
        +updateReservationStatus(client, id, status)
        +insertOutboxNotification(client, id, recipient, message)
        +updateOutboxStatus(id, status)
    }
    class PostgresReservationRepository
    class IConfirmationPolicy {
        <<interface>>
        +evaluate(candidate, hamster, slots, minutes, now) ConfirmationResult
    }
    class ConfirmationPolicy
    class NotificationIntegration {
        <<module>>
        +sendNotification(recipient, message)
    }
    class ReservationRow {
        +id
        +user_id
        +hamster_id
        +start_time
        +end_time
        +status
    }
    class HamsterRow {
        +id
        +is_active
        +requires_approval
    }
    IReservationRepository <|.. PostgresReservationRepository
    IConfirmationPolicy <|.. ConfirmationPolicy
    ReservationOperations --> IReservationRepository
    ReservationOperations --> IConfirmationPolicy
    ReservationOperations --> NotificationIntegration
    PostgresReservationRepository ..> ReservationRow
    PostgresReservationRepository ..> HamsterRow
```

`ReservationOperations` znamená exportované funkce v `service.ts`, `NotificationIntegration` funkce v `notification.ts`. Diagram nevyžaduje další frameworkové třídy. Struktura odpovídá skutečným názvům rozhraní a metod; databázový klient zná pouze služba v těle transakčního callbacku a repository, nikdy čistá policy.

# Část I: Cross-view kontrola

| Vazba | Ověřený vztah |
|---|---|
| C02 ↔ G2 | Všechny OP-01 až OP-06 mají logického vlastníka; oznámení rozlišují pokus a pouhé uložení požadavku. |
| C2 ↔ G2 | Služba orchestruje, policy vyhodnocuje Confirm, repository vlastní SQL/transakce, stub pouze předání. |
| G2 ↔ H1 | Sekvence používá stejné závislosti; technické transakce a outbox patří repository. |
| H1 ↔ H2 | Volané metody existují ve zobrazených modulech/rozhraních. |
| statechart ↔ G3/H1 | Přechod závisí na aktuálním stavu pod zámkem; Cancel a Expire respektují pořadí operací. |
| G2 ↔ G4 | Logické prvky jsou namapované do jednoho Node.js procesu a PostgreSQL. Stub je uvnitř procesu. |
| ADR ↔ G2/G4 | In-process timer, restart recovery a transakční ochrana odpovídají variantě A. |

Při kontrole 22. 10. 2026 byly nalezeny a vyřešeny rozdíly: nenapojená policy, nezamčený výběr expirací, fiktivní dispatcher a rozdílné popisy transakčního rozhraní. Behaviorální a architektonické doklady jsou v `docs/evidence-and-evolution.md`.

# Část J: AS-IS → TO-BE delta

AS-IS je historická C02 implementace zachycená v části A; její původní trace se nepřepisuje na dnešní kód.

| Oblast | AS-IS | Přijatý výsledek | Akce |
|---|---|---|---|
| SQL a transakce | Přímo v service.ts | Repository a withTransaction(callback) | CHANGE |
| Confirm pravidla | Kontroly uvnitř služby | ConfirmationPolicy.evaluate volaná skutečným Confirm | CHANGE |
| Expirace | Ruční spuštění | Timer + recovery; výběr FOR UPDATE ve stejné transakci | CHANGE |
| Blokující stavy a denní limit | CONFIRMED/PENDING_APPROVAL; 30 min | Stejné business pravidlo pod zámkem křečka | KEEP |
| Notifikační hranice | Simulovaný odesílač, outbox | Zachovat prototyp, jasně popsat rozsah bez dispatchera | KEEP |
| Kontrola vrstev a souběhu | Bez opakovatelné kontroly vlastnictví | ARCH-01 až ARCH-04 a R-01 až R-07 | VERIFY |

# C05 Detailed Design

## 1. Selected architecture unit / responsibility

- **Unit:** `ConfirmationPolicy` uvnitř Reservation Management.
- **Related requirements:** REQ-05, REQ-06 a REQ-07, rozšířené pravidly baseline v0.2.
- **Scenario:** OP-03 Confirm Reservation; běžné potvrzení i žádost PENDING_APPROVAL.
- **Rules:** BR-01 až BR-05 a BR-07. Čisté intervalové funkce sdílí Availability, celý ConfirmationPolicy se však pro veřejný dotaz OP-02 nepoužívá.

## 2. Detailed responsibilities

| Responsibility | Proč je potřeba |
|---|---|
| DR-01 Validovat interval | Neplatné datum nebo start >= end nesmí vést k alokaci. |
| DR-02 Ověřit předstih | Confirm vyžaduje currentTime <= start - 15 min. |
| DR-03 Posoudit aktivitu a režim křečka | Aktivita umožňuje potvrzení, režim určuje potřebu schválení. Existenci reference ověřuje služba. |
| DR-04 Vyhodnotit kolize | CONFIRMED i PENDING_APPROVAL blokují; dotyk intervalů ne. |
| DR-05 Ověřit denní limit | Nejvýše 30 min pro student–křeček po dnech Europe/Prague. |
| DR-06 Vrátit výsledek a cílový stav | DRAFT může přejít jen do CONFIRMED/PENDING_APPROVAL; chyba má rozlišitelný kód. |

## 3. Design elements and ownership

| Responsibility | Owner | Data/state | Důvod |
|---|---|---|---|
| DR-01 až DR-06 | ConfirmationPolicy | Kandidát, profil křečka, blokující sloty, mapa minut a referenční čas | Čisté rozhodnutí bez I/O a změn vstupů. |
| Identita, existence, načtení pod zámkem a orchestrace | confirmReservation v service.ts | Rezervace a křeček pod zámkem, transakční callback | Autoritativní vstupní data pro policy. |
| SQL, COMMIT/ROLLBACK, trvalý stav a outbox | IReservationRepository | PostgreSQL | Oddělení technologie od pravidel. |

## 4. Key interface / contract

```typescript
evaluate(candidate: ConfirmationCandidate, hamster: HamsterProfile,
         existingConfirmedIntervals: TimeInterval[],
         userDailyMinutes: Map<string, number>, currentTime: Date): ConfirmationResult;
```

**Preconditions:** služba ověřila reference a vlastníka; vstupní sloty zahrnují CONFIRMED i PENDING_APPROVAL stejného křečka bez kandidáta. Mapa minut zahrnuje stejnou dvojici student–křeček bez kandidáta. `currentTime` je platný referenční čas. Platnost intervalu a stav DRAFT ověřuje sama policy.

**Postconditions:** při splnění pravidel `{ok:true, targetStatus, message}`, jinak `{ok:false, code, message, details?}`. Policy nic neukládá, nemění vstupy ani stav rezervace. Garantuje rozhodnutí nad předanými daty; jejich aktuálnost při zápisu zajišťují zámky služby/repository.

**Failures:** INVALID_INTERVAL, LEAD_TIME_VIOLATION, HAMSTER_INACTIVE, INVALID_STATE, SLOT_CONFLICT, DAILY_LIMIT_EXCEEDED. Služba mapuje kolizi na HTTP 409, ostatní porušení policy na 400. Autorizace a existence jsou samostatné 403/404.

## 5. Focused structural view

```mermaid
classDiagram
    class ReservationManagement {
        <<module>>
        +confirmReservation(id, userId, now)
    }
    class IConfirmationPolicy {
        <<interface>>
        +evaluate(candidate, hamster, slots, minutes, now) ConfirmationResult
    }
    class ConfirmationPolicy
    class ConfirmationCandidate
    class HamsterProfile
    class ConfirmationResult
    class IReservationRepository {
        <<interface>>
        +withTransaction(callback)
    }
    IConfirmationPolicy <|.. ConfirmationPolicy
    ReservationManagement --> IConfirmationPolicy
    ReservationManagement --> IReservationRepository
    ConfirmationPolicy ..> ConfirmationCandidate
    ConfirmationPolicy ..> HamsterProfile
    ConfirmationPolicy ..> ConfirmationResult
```

## 6. Detailed sequence

```mermaid
sequenceDiagram
    participant Svc as confirmReservation
    participant Repo as IReservationRepository
    participant Policy as ConfirmationPolicy
    Svc->>Repo: withTransaction: zamknout rezervaci a křečka, načíst sloty a minuty
    Svc->>Policy: evaluate(candidate, hamster, slots, minutes, now)
    Policy->>Policy: isIntervalValid a isAtLeast15MinBefore
    Policy->>Policy: aktivita a stav DRAFT
    loop Blokující intervaly
        Policy->>Policy: doIntervalsOverlap
    end
    Policy->>Policy: calculateMinutesPerDay + kontrola limitu
    alt Porušení pravidla
        Policy-->>Svc: ok=false + konkrétní kód
        Svc-->>Repo: chyba callbacku: ROLLBACK
    else Pravidla splněna
        Policy-->>Svc: ok=true + cílový stav dle requiresApproval
        Svc->>Repo: změna stavu a outbox ve stejném callbacku
        Repo-->>Svc: COMMIT a uvolnění klienta
    end
```

Pokus o předání oznámení až po COMMIT ukazuje úplná sekvence H1. Chybové větve algoritmu končí okamžitě; další kroky se po první chybě neprovádějí.

## 7. Important methods / operations

**Operation:** ConfirmationPolicy.evaluate. **Responsibility:** vyhodnotit podmínky Confirm. **Input:** kandidát, profil, blokující sloty, mapa minut a čas. **Output:** ConfirmationResult. **Preconditions:** data dle kontraktu výše. **Postconditions:** rozhodnutí s cílovým stavem nebo první chybou. **Side effects:** žádné. **Failure behavior:** vrácený objekt, nikoli I/O výjimka.

**Operation:** calculateMinutesPerDay(start, end). **Responsibility:** rozdělit délku mezi pražské kalendářní dny. **Input:** platný interval. **Output:** mapa YYYY-MM-DD → minuty. **Preconditions:** platné start < end. **Postconditions:** součet odpovídá délce intervalu. **Side effects:** žádné. **Failure behavior:** validitu intervalu před voláním zajišťuje policy/služba.

## 8. Algorithm / decision logic

1. Neplatný interval → INVALID_INTERVAL.
2. currentTime > start - 15 min → LEAD_TIME_VIOLATION.
3. Neaktivní křeček → HAMSTER_INACTIVE.
4. Jiný stav než DRAFT → INVALID_STATE.
5. Překryv s blokujícím slotem → SLOT_CONFLICT.
6. Pro každý den přičíst kandidátovy minuty; součet > 30 → DAILY_LIMIT_EXCEEDED.
7. requiresApproval → PENDING_APPROVAL, jinak CONFIRMED.

## 9. DD decisions intentionally left to code

Formátování zpráv, konkrétní iterace nad mapou a pomocné sestavení vstupů z databázových řádků. Rozsah transakce, blokující stavy, pořadí rozhodnutí a návratové kódy jsou významná rozhodnutí popsaná výše. Ověření DD i napojení na HTTP je v evidence-and-evolution.md.
