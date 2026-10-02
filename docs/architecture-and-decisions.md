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

Analýza vychází ze skutečného kódu aplikace z C02, nikoliv z návrhu
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

