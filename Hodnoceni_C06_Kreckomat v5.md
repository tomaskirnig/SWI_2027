# C06 — Assessment Form (CZ)

## Projekt

```text
Hodnotící tým: Deadlock - Radek Skalík, Dominik Kontrik, Petr Michalík, Richard Bohunovský
Hodnocený tým: Křečkomat — Martin Kalus, Tomáš Kirnig, Petr Gála, Dennis Carnevale

Projekt: Křečkomat — rezervační systém školních křečků
Assessed commit/tag: 996e9be8880187314e14d294c6fcc11974b50556
Datum: 22. 10. 2026
```

Kontrolovaná verze: [tomaskirnig/SWI_2027](https://github.com/tomaskirnig/SWI_2027/tree/996e9be8880187314e14d294c6fcc11974b50556). Všechny odkazy na soubory níže se vztahují k tomuto commitu.

Hodnocení vychází ze zadání CV01, CV02, obou částí CV03, CV05 a pokynů C06. Podle C06 se kontroluje vybraná operace, architektonické rozhodnutí a návrh. Historický spike se znovu nehodnotí.

**Podklady projektu:** C02 — `docs/reservation-specification.md`, `DIAGRAMS.md`; C03 a C05 — `docs/architecture-and-decisions.md`, `docs/evidence-and-evolution.md`.

**Příkazy podle README:** build `npm run build`, spuštění `npm run dev` nebo po sestavení `npm start`, testy `npm test` a integrační sada `npm run verify`.

**Průběh a omezení kontroly:** Prošlo 10 unit testů a 4 architektonické kontroly přes `node --import tsx`. 

Při opakované validaci prošlo znovu 10 unit testů a 4 architektonické kontroly. Dalších 12 dočasných kontrol znovu potvrdilo F1 a F2; samotná policy se na přesné hranici 15 minut chová správně.

## Stavy

- **YES:** Splněno a doloženo.
- **PARTLY:** Částečně splněno nebo neúplně ověřeno.
- **NO:** Zjištěno nesplnění nebo rozpor.
- **N/A:** Na dané hodnocení se nevztahuje; důvod je uveden u záznamu.

## C01 — Baseline

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| B1 Stejná identifikovaná baseline pro docs/code/tests | YES | Dokumentace, kód i testy jsou součástí stejného hodnoceného commitu `996e9be…`. Verze projektu je tedy jasně určená. |
| B2 Relevantní produkt nebo testy lze spustit | YES | `src/domain.test.ts`: 10 PASS; `src/arch.test.ts`: 4 PASS. Testy prošly přes `node --import tsx`. |

## C02 — Engineering Specification

Vybraná operace: **OP-03 Confirm Reservation**, verze v0.2.  
Vybraný business rule / invariant: **BR-04 — denní limit student–křeček**. Potvrzené rezervace a žádosti čekající na schválení společně čerpají nejvýše 30 minut denně pro stejnou dvojici student–křeček. Den se určuje podle `Europe/Prague`; rezervace přes půlnoc se rozdělí mezi oba dny. Ostatní stavy limit nečerpají.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| R1 Operation: input + precondition + postcondition/state | YES | `docs/reservation-specification.md`, OP-03 a §4.2: jsou popsané vstupy, vlastnictví rezervace, výchozí stav DRAFT, podmínky potvrzení i výsledné stavy CONFIRMED/PENDING_APPROVAL. Neúspěch má rezervaci ponechat beze změny. |
| R2 Business rule/invariant je jednoznačný | YES | BR-04 a jeho rozšíření v0.2 jasně určují limit 30 minut, časové pásmo, rozdělení přes půlnoc a započítávané stavy. |
| R3 Operation/rule je konzistentní se state modelem | YES | `DIAGRAMS.md`, §2.1 odpovídá specifikaci: DRAFT limit nečerpá, PENDING_APPROVAL ano. Podmínky a odpovědnosti za přechody doplňuje architektura v G3. |
| R4 Implementace odpovídá specifikované semantics | NO | Byly ověřeny dva rozpory s dokumentací: potvrzení může po čekání použít zastaralý čas a frontend nesprávně počítá čerpání denního limitu. Viz F1 (`src/service.ts`) a F2 (`public/index.html`). Serverová kontrola limitu zůstává zachovaná. |
| R5 Existuje vhodná verification evidence | YES | `src/domain.test.ts` (T-DD-02, 04A/B, 06A/B), `src/verify.ts` (V-11 až V-15B) a `src/regression.test.ts` (R-01, R-07) ověřují skutečné podmínky potvrzení, kolize a denní limit. Unit testy znovu prošly; DB běhy jsou doloženy týmem. Chybějící regrese pro F1/F2 jsou uvedeny u nálezů, ale neruší vhodnost existujících testů. |

## C03 — Architecture

Vybraná responsibility: **potvrzení rezervace a ochrana termínu i denního limitu**. Služba řídí operaci, `ConfirmationPolicy` kontroluje pravidla a repository zajišťuje transakce a zámky.  
Vybraná interaction: **H1 — načtení pod zámkem → kontrola pravidel → změna stavu a outbox → COMMIT → pokus o oznámení**.  
Vybrané ADR/decision: **ADR-01 — schvalování a časovač expirací ve stejném aplikačním procesu**.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| A1 Responsibility + owner jsou explicitní | YES | `docs/architecture-and-decisions.md`, C2/G2/G3/H2 jasně rozdělují práci mezi službu, policy a repository. Je také vysvětleno, že některé části jsou skupiny funkcí v `service.ts`, nikoli samostatné třídy. |
| A2 Skutečný code ownership odpovídá architektuře | YES | Rozdělení v `src/service.ts`, `src/domain.ts` a `src/repository.ts` odpovídá návrhu. API volá službu a SQL zůstává v repository. Kontroly ARCH-01 až ARCH-04 prošly; ověřují vybraná pravidla, nikoli celou architekturu. |
| A3 Dynamic interaction odpovídá skutečnému call path | YES | Sekvence H1 odpovídá `confirmReservation()`: načtení dat, volání policy, zápis stavu a outboxu v transakci. `attemptNotification()` následuje po COMMIT. Při odmítnutí policy se transakce vrátí zpět. Časový problém je popsán ve F1. |
| A4 ADR/decision odpovídá současné implementaci | YES | ADR-01/G4 odpovídají `src/index.ts`: kontrola expirací při startu a potom standardně každých 30 s ve stejném procesu. `expirePendingReservations()` provádí změny a zápis outboxu v jedné transakci. Ověřeno v kódu; restart aplikace zde nebyl testován. |

## C04 — Quality & Measurement

Quality concern: **N/A — nehodnoceno.**  
Criterion: **N/A — nehodnoceno.**

**Odůvodnění:** Zadání 6 požaduje hodnocení C04, ale odpovídající úkol v dodaných zadáních CV01, CV02, CV03 A/B a CV05 chybí. Jde o nesoulad podkladů. Tato část se proto nekontroluje a její absence se nepovažuje za chybu projektu.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| Q1 Criterion je skutečně evaluable | N/A | Nekontrolováno: požadavek v části C04 Zadání 6 nemá odpovídající zadání v dodaných CV01–CV05. |
| Q2 Measurement měří criterion ve správném contextu | N/A | Nekontrolováno ze stejného důvodu; viz odůvodnění nesouladu podkladů výše. |
| Q3 Decision odpovídá výsledku měření | N/A | Nekontrolováno ze stejného důvodu; viz odůvodnění nesouladu podkladů výše. |

## C05 — Detailed Design & Unit Verification

Vybraná software unit: **`ConfirmationPolicy` pro OP-03**, rozpracovaná v C05.

| ID | Odpověď | Evidence / komentář |
|---|---|---|
| D1 Design intent je explicitní a pochopitelný | YES | `docs/architecture-and-decisions.md`, C05 §1–9 popisují odpovědnosti, rozhraní evaluate, strukturu, sekvenci, algoritmus i chybové výsledky. Z návrhu je pochopitelné, jak má jednotka fungovat. |
| D2 DD odpovídá skutečné implementaci | YES | `src/domain.ts`, `IConfirmationPolicy` a `ConfirmationPolicy.evaluate()` odpovídají popsaným kontrolám a výsledkům. Služba policy skutečně používá. F1 vzniká předáním zastaralého času ze služby/API, nikoli výpočtem uvnitř policy. |
| D3 Unit/component tests jsou odvoditelné z DD | YES | `docs/evidence-and-evolution.md`, tabulka „Tests derived from DD“, propojuje 10 testů s návrhovými rozhodnutími. U dvou testů zdůvodňuje i zvolenou úroveň. Odpovídající testy v `src/domain.test.ts` prošly. |
| D4 Relevantní branches/boundaries/states/failures jsou ověřeny | PARTLY | Původní sada `src/domain.test.ts` pokrývá hlavní větve a chyby, ale ne úspěch přesně 15 minut před začátkem. T-DD-02 ověřuje pouze odmítnutí při 14 minutách. Dodatečná kontrola hodnotitele potvrdila správný výsledek přesně na hranici i odmítnutí 1 ms po ní. Výhrada se týká mezery v testech C05, nikoli chyby výpočtu. |
| D5 Vybraný test má smysluplný oracle/expected result | YES | T-DD-05B v `src/domain.test.ts`: interval 14:30–15:00 navazuje na 14:00–14:30 a musí projít bez kolize. Očekávání vychází z BR-01 `[start,end)`, tedy z pravidla, že dotyk hranic není překryv. Test prošel. |

## Candidate findings

Níže jsou dvě potvrzené chyby a jeden zamítnutý kandidát. Návrhy oprav nebyly v projektu provedeny.

### F1

```text
Source: C02 — OP-03, REQ-05, BR-01/BR-03; dopad také OP-05
Engineering claim: OP-03/REQ-05 a BR-01 určují čas v okamžiku rozhodnutí operace, ne v okamžiku přijetí požadavku.
Expected: Po čekání na zámky se znovu zjistí čas; pozdní potvrzení či schválení se odmítne bez změny dat.
Observed: Čas se odečte před čekáním a pak se použije znovu, i když už lhůta uplynula.
Evidence: docs/reservation-specification.md, REQ-05 (ř. 170), BR-01 (ř. 317) a BR-03 v0.2; src/app.ts, getEffectiveTime a handler Confirm (ř. 132); src/service.ts, confirmReservation (ř. 104–122) a decideReservation (ř. 169–184).
Verification performed: Původní služby byly znovu spuštěny bez parametru now, s řízenými hodinami a simulovaným čekáním repository. Pro Confirm i Approve byly ověřeny tři situace: před lhůtou, příchod po lhůtě a překročení lhůty při čekání. Chyba nastala pouze ve třetím případě; obě služby vrátily CONFIRMED a požádaly o zápis stavu.
Result: VERIFIED FINDING
```

Pro rezervaci od 14:00 UTC vyšly tyto výsledky:

| Operace | Požadavek přijat | Rozhodnutí po čekání | Povolená hranice | Očekáváno | Pozorováno |
|---|---|---|---|---|---|
| Confirm | 13:44:59.900 | 13:45:00.100 | Nejpozději 13:45:00 | Odmítnutí, DRAFT | CONFIRMED |
| Approve | 12:59:59.900 | 13:00:00.100 | Před 13:00:00 | Odmítnutí, PENDING_APPROVAL | CONFIRMED |

Aplikace tedy může povolit operaci po lhůtě, protože kontroluje čas přijetí místo času rozhodnutí. Ověření simulovalo čekání; nešlo o test zámků nad skutečnou PostgreSQL. Existující V-15A používá pevný čas a tento případ nezachytí.

**Návrh opravy:** Předávat funkci pro získání času a zavolat ji až po potřebných načteních a zámcích, těsně před kontrolou pravidel:

```typescript
type Clock = () => Date;
const systemClock: Clock = () => new Date();

// Nový parametr služby: clock: Clock = systemClock
// Po získání zámků a načtení vstupů:
const decision = confirmationPolicy.evaluate(
  candidate, hamsterProfile, blockingIntervals, dailyMinutes,
  clock(),
);
```

HTTP handler má předat živé hodiny; pevný čas zůstane dostupný pro testy:

```typescript
function clockForRequest(req: Request): Clock {
  const header = req.headers['x-current-time'];
  if (typeof header === 'string') {
    const time = new Date(header).getTime();
    if (Number.isFinite(time)) return () => new Date(time);
  }
  return systemClock;
}
// Handler Confirm: confirmReservation(id, user_id, clockForRequest(req))
```

Obdobně upravit Cancel a Decide; u Decide kontrolovat lhůtu až po potřebných zámcích včetně křečka. Testy s argumentem `NOW` převést na `() => NOW`. Doplnit test překročení lhůty během čekání, který ověří odmítnutí, původní stav a žádný nový záznam v outboxu. Změnu promítnout do kontraktů a sekvencí.

### F2

```text
Source: C02 — BR-04, verze v0.2
Engineering claim: Limit čerpají CONFIRMED i PENDING_APPROVAL, po dnech Europe/Prague a s rozdělením přes půlnoc.
Expected: Ukazatel a kontrola limitu na webu počítají stejně jako server.
Observed: Web vynechává čekající žádosti, den určuje z UTC data začátku a celou délku započte do jediného dne. Stejně přičítá i nový požadavek.
Evidence: README.md, Webové uživatelské rozhraní (ř. 97), slibuje ukazatel denního limitu; docs/reservation-specification.md, BR-04 a rozšíření v0.2; public/index.html, calculateUsedMinutesForDay (ř. 2124) a runAvailabilityCheck (ř. 2101); src/domain.ts, calculateMinutesPerDay.
Verification performed: Původní frontendový skript byl znovu spuštěn v Node VM s náhradou DOM a API, v pásmu Europe/Prague. Ve čtyřech případech byly ověřeny výpočet minut, text ukazatele i stav tlačítka. API hlásilo volný termín, aby se ověřovala samotná místní kontrola limitu.
Result: VERIFIED FINDING
```

| Případ | Správný výsledek | Výsledek webu |
|---|---|---|
| Čekající žádost Archimeda na 20 min | 20 min | 0 min |
| Potvrzeno 10. 6. 00:10–00:30 v Praze; v UTC je začátek ještě 9. 6. | 20 min dne 10. 6. | 0 min dne 10. 6. |
| Potvrzeno 10. 6. 23:50–11. 6. 00:10 v Praze | 10 min dne 10. 6. | 20 min dne 10. 6. |
| Již využito 20 min dne 10. 6.; nový termín 23:50–00:10 | Denní součty 30 a 10 min; povolit | Web sečte 20 + 20 min a tlačítko zakáže |

Backendový výpočet minut v kontrolovaných případech odpovídá pravidlu. Ve webové funkci se chyba projeví i na tlačítku: v prvních dvou případech povolí další dvacetiminutový termín, přestože má být odmítnut; ve třetím jej zbytečně zakáže. Nález neprokazuje překročení limitu uloženého v databázi. Nevyžaduje se zde nová funkce UI; kontroluje se již implementovaný a v README popsaný ukazatel pravidla BR-04.

**Návrh opravy:** Sjednotit výpočet s backendem. Pro frontend lze použít následující rozdělení minut podle pražských dnů:

```javascript
const pragueDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague', year: 'numeric',
  month: '2-digit', day: '2-digit'
});

function minutesByPragueDay(start, end) {
  const minutes = new Map();
  for (let t = start.getTime(); t < end.getTime();) {
    const next = Math.min((Math.floor(t / 60000) + 1) * 60000,
                          end.getTime());
    const day = pragueDay.format(new Date(t));
    minutes.set(day, (minutes.get(day) || 0) + (next - t) / 60000);
    t = next;
  }
  return minutes;
}

function calculateUsedMinutesForDay(userId, hamsterId, day) {
  return myReservations.reduce((sum, r) => {
    if (r.user_id !== userId || r.hamster_id !== hamsterId ||
        !['CONFIRMED', 'PENDING_APPROVAL'].includes(r.status)) return sum;
    return sum + (minutesByPragueDay(
      new Date(r.start_time), new Date(r.end_time)
    ).get(day) || 0);
  }, 0);
}
```

V `runAvailabilityCheck` kontrolovat všechny dny nového požadavku místo přičtení celé délky k jednomu dni:

```javascript
const exceedsLimit = [...minutesByPragueDay(interval.start, interval.end)]
  .some(([day, requested]) => requested + calculateUsedMinutesForDay(
    currentUserId, selectedHamsterId, day
  ) > 30);
// Původní if (totalWithCurrent > 30) změnit na if (exceedsLimit).
```

Doplnit testy uvedených případů i nového požadavku přes půlnoc. Kontrolu na serveru zachovat, protože data v prohlížeči mohou mezitím zastarat.

### F3

```text
Source: C04 — nesoulad podkladů učitele
Engineering claim: Původní podezření bylo, že projektu chybí povinný výstup C04.
Expected: Hodnotit lze pouze skutečně zadané požadavky.
Observed: Zadani6 předpokládá C04, ale dodaná zadání odpovídající úkol neobsahují.
Evidence: Zadani6_vyhodnocení_popis, Důležité pravidlo a C04; formulář Q1–Q3; dodaná zadání CV01–CV05.
Verification performed: Porovnání zadání s pokyny pro hodnocení; povinnost C04 nebyla doložena.
Result: REJECTED CANDIDATE — nejde o chybu projektu; Q1–Q3 = N/A.
```

F3 zůstává jen jako záznam zamítnutého podezření. Ověřené chyby projektu jsou F1 a F2.

## Owner disposition

**Vyjádření autorů**

| Finding | ACCEPTED / REJECTED / DEFERRED | Reason/evidence | Action / no-change |
|---|---|---|---|
| F1 | |  |  |
| F2 | |  |


