# C02 — poznámky k podstatným opravám

Datum kontroly: 12. 10. 2026. Projekt: Křečkomat.

Kontrolovaná větev: `codex/c02-basic-operations`, commit `d9379af427c11000b55f97dc2290d5dfb19be1e9`.

Tento dokument obsahuje návrhy, nikoli záznam provedených oprav. Kód ani dokumentace projektu nebyly těmito poznámkami změněny. Čísla řádků platí pro uvedený commit; po úpravách se posunou.

Rozlišení:

- **OPRAVIT:** skutečná chyba ověřování nebo nedostatek vůči zadání C02.
- **ROZHODNOUT:** rozpor s vlastní specifikací; správným řešením může být změna kódu nebo vědomé zpřesnění rozsahu, nikoli automatické přidání nové funkce.
- **DOPLNIT EVIDENCI:** chybějící doklad není automaticky důkaz, že práce neproběhla.

Hlavní zdroj: [zadání C02](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/zadani_2.txt). Zadání v bodu 11 výslovně připouští opravu specifikace, příkladu ověření nebo implementace podle toho, kde nesoulad skutečně vznikl.

## 1. OPRAVIT — assertions mohou propustit chybný test jako PASS

**Kde:** [src/verify.ts:16](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/verify.ts:16), započítávání výsledků v [src/verify.ts:1148](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/verify.ts:1148).

**Proč je to špatně:** `console.assert` při nesplněné podmínce pouze vypíše zprávu. Nevyhodí výjimku, takže `scenario.run()` může doběhnout a runner zvýší `passed`. Některé jiné kontroly ve skriptu výjimky vyhazují správně; není tedy pravda, že vůbec žádný test nemůže selhat. Nespolehlivé jsou především kontroly pomocí tohoto importu.

**Vztah k zadání:** body 11, 14 a 15 požadují skutečné ověření chování a pravdivou evidenci. Knihovna ani přesný počet 30 testů předepsané nejsou.

Před:

```ts
import { assert } from 'console';
```

Po:

```ts
import assert from 'node:assert/strict';
```

Stávající volání mohou zůstat:

```ts
assert(reservation.status === 'DRAFT', 'Očekáván stav DRAFT.');
```

**Proč oprava funguje:** nepravdivá podmínka vyhodí `AssertionError`. Stávající `catch` v runneru ji započítá jako FAIL a skript při neúspěchu nastaví nenulový návratový kód.

**Ověření opravy:** dočasný scénář s `assert(false, 'Kontrolní selhání')` musí skončit jako FAIL. Potom jej odstranit a znovu spustit skutečné scénáře.

**Pozor:** [src/verify.ts:50](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/verify.ts:50) používá `TRUNCATE`. Ověření spouštět pouze proti oddělené testovací databázi, nikoli proti sdíleným rezervacím spolužáků.

## 2. OPRAVIT — OP-05 nemá celou požadovanou strukturu

**Kde:** [docs/reservation-specification.md:486](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:486).

**Proč je to špatně:** operace Approve/Reject obsahuje cíl, trigger, požadavky, předpoklady, výsledek, přechody a příklady. Chybí samostatně promyšlený hlavní scénář, alternativní/chybové výsledky, odkazy na pravidla a zdůvodnění.

**Vztah k zadání:** [bod 13](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/zadani_2.txt:325) výslovně požaduje stejnou strukturu Approve jako u ostatních operací. TBD se doplňuje pouze při skutečné nejistotě.

Před — současná návaznost oddílů:

```md
**Změna stavu:**
PENDING_APPROVAL → CONFIRMED nebo PENDING_APPROVAL → REJECTED

**Příklady ověření:**
...
```

Po — mezi přechody a příklady doplnit například:

```md
**Odkaz na doménová pravidla / invarianty:**
BR-01 — interval a rozhodný čas; BR-02 — blokující rezervace;
BR-03 — lhůta rozhodnutí; BR-04 — denní limit;
BR-05 — povolené přechody; BR-06 — oznámení;
BR-07 — aktivita křečka. Použijí se rozšíření pro v0.2.

**Hlavní úspěšný scénář:**
1. Správce odešle identifikátor rezervace a APPROVE nebo REJECT.
2. Systém ověří oprávnění, existenci rezervace a PENDING_APPROVAL.
3. Ověří lhůtu currentTime < start - 1h;
   při APPROVE také aktivitu křečka.
4. Provede právě jeden povolený přechod na CONFIRMED nebo REJECTED.
5. Uloží výsledek a požadavek na oznámení studentovi.
6. Vrátí identifikátor, výsledný stav a rozhodnutí.

**Alternativní / chybové výsledky:**
- Neoprávněná osoba → odmítnutí bez změny rezervace.
- Neexistující rezervace → odmítnutí bez změny dat.
- Jiný stav než PENDING_APPROVAL → odmítnutí bez nového oznámení.
- Neplatná hodnota rozhodnutí → odmítnutí bez změny dat.
- currentTime >= start - 1h → odmítnutí rozhodnutí;
  následné provedení expirace určuje OP-06.
- Neaktivní křeček při APPROVE → odmítnutí, žádost se tím nezmění.
- Souběžné rozhodnutí, zrušení nebo expirace → operace respektuje
  aktuální stav; nesmí přepsat již dokončený konkurenční přechod.

**Zdůvodnění / zdroj:**
Změnová karta C02, bod 12: vybrané prostředky vyžadují rozhodnutí
oprávněné osoby před závazným potvrzením. Oddělení žádosti
a rozhodnutí umožňuje zpoždění, zamítnutí a vypršení.
```

**Proč takto:** doplňuje význam chování, nepředepisuje Repository, nový proces ani jinou předčasnou architekturu. Vlastní hodinová lhůta je již rozhodnutím projektu, nikoli hodnotou ze zadání. Krok s oznámením je nutné sladit s rozhodnutím v bodu 9 těchto poznámek; samotné doplnění scénáře neřeší dnešní slib doručení.

**Ověření opravy:** OP-05 má všechny relevantní části šablony; alternativy odpovídají kódu a zvolené politice. Doplnit příklad na hranici lhůty a důležitý souběh, pokud pro ně zatím chybí důkaz.

## 3. OPRAVIT — kontrola přijetí nepokrývá nové požadavky

**Kde:** [docs/reservation-specification.md:364](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:364). Tabulka končí `REQ-09`, přesto jsou dále deklarovány `REQ-10` až `REQ-14`.

**Proč je to špatně:** pro novou část baseline chybí záznam, že tým rozumí významu, potřebě, ověřitelnosti, času, souběhu, konzistenci, proveditelnosti a nejistotám.

**Vztah k zadání:** bod 3 platí pro každý přijatý požadavek. Není nutná konkrétní tabulka ani mechanické opisování otázek.

Před:

```md
Kontrola byla provedena 22. 9. 2026 nad požadavky REQ-01 až REQ-09.
```

Po — přidat samostatný skutečně vyplněný záznam, původní datum nepřepisovat:

```md
### Kontrola změněných a nových požadavků baseline v0.2

Datum revize: [doplnit skutečné datum]
Revidující: [doplnit členy týmu]
Rozsah: REQ-10 až REQ-14 a původní požadavky dotčené změnou.

Příklad rozpracované kontroly REQ-12:
- Význam: rozhodnout může oprávněný správce a jen čekající žádost.
- Potřeba: chrání workflow před nepovoleným nebo opakovaným rozhodnutím.
- Pozorovatelný výsledek: odmítnutí bez změny rezervace a nového oznámení.
- Proveditelnost: kontrola role a stavu před provedením přechodu;
  model důvěryhodné identity musí být výslovně vymezen.
- Ověřitelnost: V-23, V-24; porovnat stav a oznámení před/po pokusu.
- Stav/čas: PENDING_APPROVAL a lhůta podle BR-03 v0.2.
- Souběh: rozhodnutí nesmí přepsat dokončené Cancel/Expire/Decide.
- Konzistence: musí souhlasit s OP-05, BR-05 a stavovým diagramem.
- Nejistota: je role simulovaná pro demo, nebo skutečně autentizovaná?
- Výsledek revize: [doplnit až po skutečném rozhodnutí týmu]
```

Podobně přezkoumat:

- `REQ-10`: povolené schválení, aktivita, lhůta, zachování blokace/limitu, význam oznámení a souběh.
- `REQ-11`: zamítnutí, společné předpoklady OP-05, uvolnění blokace/limitu, oznámení a souběh.
- `REQ-13`: přesný spouštěč expirace, hranice času, opoždění kontroly, restart a souběh s rozhodnutím.
- `REQ-14`: uvolnění limitu i dostupnosti a evidence oznámení oběma příjemcům.

**Proč takto:** nevyrábí zpětné schválení ani automaticky neoznačuje nerozhodnuté požadavky jako přijaté. Nejprve je třeba vyřešit jejich skutečný rozsah.

## 4. OPRAVIT — dopad na Create je označen nesprávně

**Kde:** [docs/reservation-specification.md:403](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:403), souhrn na [řádku 418](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:418).

**Doklad v kódu:** Create volá kontrolu konfliktu a limitu v [src/service.ts:206](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/service.ts:206). Vyhledávání nyní zahrnuje `CONFIRMED` i `PENDING_APPROVAL` v [src/service.ts:154](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/service.ts:154), stejně tak výpočet limitu na řádku 102.

**Proč je to špatně:** nezměněný výstupní stav `DRAFT` neznamená nezměněné chování. Existující čekající žádost nově může způsobit odmítnutí Create.

**Vztah k zadání:** bod 13 vyžaduje správnou identifikaci dotčených i nedotčených částí.

Před:

```md
| Create (OP-01) | Nemění se. Vytváří stále nezávazný návrh DRAFT. |

Nedotčené požadavky: REQ-01 a REQ-02 (Create stále vytváří pouze DRAFT).
```

Po — návrh přesnějšího rozlišení:

```md
| Create (OP-01) | Výstup DRAFT se nemění. Rozšiřují se předběžné
kontroly: PENDING_APPROVAL blokuje termín a čerpá denní limit. |

Dotčené požadavky:
- REQ-01: předběžná kontrola zahrnuje i PENDING_APPROVAL.
- REQ-02: princip odmítnutí bez vytvoření zůstává;
  prostřednictvím REQ-01 se rozšiřuje množina důvodů odmítnutí.
- REQ-03 a REQ-05: blokující stavy a větvení Confirm.
- REQ-06: úspěšný Confirm může vrátit také PENDING_APPROVAL;
  vzniká požadavek na oznámení správci.
- REQ-07: souběžné alokace zahrnují také přechod do PENDING_APPROVAL.
- REQ-08 a REQ-09: Cancel může pracovat také s PENDING_APPROVAL.

Nezměněné aspekty:
- Create nadále vytváří pouze DRAFT a sám nealokuje křečka.
- BR-01: polouzavřené intervaly a definice překryvu se nemění.
- Denní limit zůstává 30 minut pro dvojici student–křeček;
  mění se však stavy, které jej čerpají.
```

**Proč takto:** odděluje nezměněný princip od změněné podmínky. Stejné rozšíření musí být uvedeno v normativní části v0.2, nejen v analytickém komentáři.

**Ověření opravy:** doplnit příklad, kdy existující `PENDING_APPROVAL` zabrání novému Create kvůli konfliktu, a příklad vlivu na limit. Neoznačovat jejich běh za provedený, dokud skutečně neproběhne.

## 5. OPRAVIT — diagram slibuje expiraci DRAFT a nabídku posunu času

**Kde:** [DIAGRAMS.md:70](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/DIAGRAMS.md:70), přechody na řádcích 87 a 271, poznámky u DRAFT na řádcích 78 a 263. Slib nabídky posunu je také v [docs/reservation-specification.md:205](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:205).

**Proč je to špatně:** kód při pozdním Confirm odmítne požadavek a rezervaci ponechá `DRAFT`. Neprovádí expiraci DRAFT. UI při neúspěchu potvrzení pouze zobrazí chybu, nenabízí deklarovaný posun termínu.

**Vztah k zadání:** konzistence pohledů je povinná v bodech 9b a 10. Expirace DRAFT ani posouvání času nejsou předepsané funkce.

Před — odstranit z příslušných diagramů:

```mermaid
DRAFT --> [*] : Uplynutí termínu bez potvrzení / opuštění návrhu
DRAFT --> [*] : Uplynutí termínu bez potvrzení
```

Po — místo nepodloženého přechodu zpřesnit poznámku:

```mermaid
note right of DRAFT
    Návrh neblokuje křečka ani denní limit.
    Pozdní Confirm je odmítnut bez změny stavu.
    Samotné uplynutí času DRAFT nemění.
end note
```

Před — alternativní výsledek OP-03:

```text
... odmítnutí; klientské rozhraní nabídne posun času o prodlevu;
rezervace zůstane DRAFT.
```

Po:

```text
Při currentTime > start - 15 min je potvrzení odmítnuto
s rozlišitelným důvodem. Rezervace zůstane DRAFT.
Automatický posun termínu ani expirace DRAFT nejsou součástí baseline.
```

**Proč takto:** opravuje nechtěný slib místo přidání nepovinné funkcionality. Přechod `PENDING_APPROVAL → EXPIRED` tímto neodstraňovat — patří do schvalovací změny a je to jiný případ.

**Ověření opravy:** diagram, popis OP-03 a skutečný výsledek pozdního Confirm jsou stejné. Prověřit také vysvětlující odstavce, nestačí smazat jednu šipku.

## 6. OPRAVIT / DOPLNIT EVIDENCI — odlišit skutečné výsledky od tvrzení

**Kde:** [docs/evidence-and-evolution.md:73](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/evidence-and-evolution.md:73), tvrzení o plánovači na [řádku 115](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/evidence-and-evolution.md:115), dále README a ROADMAP.

**Proč je to špatně:** existuje záznam běhu 30 PASS, ale kvůli assertions neprokazuje všechny očekávané výsledky. Dokumentace také tvrdí existenci automatického plánovače, ačkoli máme ručně volanou funkci/endpoint.

**Vztah k zadání:** bod 15 požaduje konkrétní pravdivou evidenci propojenou s verzí aplikace.

Před:

```text
Všechny definované ověřovací scénáře prošly úspěšně.
Vznikl systémový plánovač úloh pro automatickou expiraci.
```

Po — dokud není oprava a nový běh skutečně proveden:

```text
Původní běh vykázal 30 PASS / 0 FAIL. Následnou kontrolou bylo
zjištěno, že console.assert nevyhazuje výjimku a tento výsledek
neprokazuje splnění všech kontrolovaných podmínek.
Nové ověření po opravě assertions: dosud neprovedeno.

Expirace je implementována jako funkce a ručně vyvolatelný endpoint.
Automatické periodické spouštění v této verzi není implementováno.
```

Po skutečném novém ověření přidat:

```md
Datum běhu: [skutečné datum]
Commit implementace: [skutečný hash testované verze]
Prostředí: oddělená testovací PostgreSQL databáze
Příkaz: npm run verify
Výsledek: [skutečné počty PASS/FAIL]
Nalezené rozdíly a řešení: [konkrétní nálezy, ne automaticky „žádné“]
Rozsah: [co bylo ověřeno; službové testy nejsou automaticky HTTP E2E]
```

**Proč takto:** nezahazuje historický běh, ale vysvětluje jeho omezení. Nový výsledek se nesmí doplnit odhadem ani před spuštěním testů.

### Explicitní schválení týmem

**Kde:** přijatost je deklarována v úvodu specifikace, ale z auditu neplyne konkrétní dohledatelné schválení celé v0.1. Absence GitHub review není důkaz neschválení.

**Vztah k zadání:** bod 10 požaduje týmové schválení; neurčuje GitHub ani počet approvals.

Návrh záznamu — vyplnit pouze podle skutečnosti:

```md
### Týmové schválení baseline

Baseline: [v0.1 / v0.2]
Schválená verze dokumentů: [commit nebo jednoznačný odkaz na verzi]
Datum: [skutečné datum]
Schválili: [skuteční členové týmu]
Otevřené body: [konkrétní výjimky / žádné po jejich skutečném vyřešení]
```

Není nutné zpětně vyrábět PR review. Pokud schválení proběhlo ústně, zaznamenat to pravdivě; pokud ne, provést jej nyní nad konkrétní verzí.

## 7. DOPLNIT — pokrytí diagramy aktivit

**Kde:** [DIAGRAMS.md:109](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/DIAGRAMS.md:109) a [DIAGRAMS.md:178](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/DIAGRAMS.md:178). Jsou zde pouze aktivity Confirm a Cancel pro v0.1.

**Vztah k zadání:** bod 9c požaduje aktivity pro jednotlivá chování, ale neurčuje přesný počet diagramů. Doplnění Create a Availability je bezpečný výklad; není to požadavek na nový kód.

Před: samostatná aktivita Create a Availability chybí.

Po — příklad malé aktivity Availability pro v0.2:

```mermaid
flowchart TD
    A[Dotaz na křečka a interval] --> B{Platný interval?}
    B -- Ne --> X[Odmítnout bez změny dat]
    B -- Ano --> C{Křeček existuje?}
    C -- Ne --> X
    C -- Ano --> D{Křeček je aktivní?}
    D -- Ne --> U[UNAVAILABLE]
    D -- Ano --> E{Překryv s CONFIRMED nebo PENDING_APPROVAL?}
    E -- Ano --> U
    E -- Ne --> V[AVAILABLE]
```

Identitu/opravení přístupu doplnit podle skutečně zvoleného rozsahu, ne vymyslet jen v diagramu. U Create ukázat předběžnou kontrolu času, aktivity, kolize a limitu a uložení `DRAFT`. Pokud původní aktivity zůstanou výslovně historickou v0.1, nepřepisovat jim význam; doplnit v0.2 pohled na změněné větvení Confirm a Cancel.

## 8. ROZHODNOUT — automatická expirace versus demonstrační spouštění

**Kde:** [docs/reservation-specification.md:526](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:526), [src/index.ts:9](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/index.ts:9), [src/app.ts:192](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/app.ts:192).

**Nesoulad:** specifikace slibuje periodický automatický plánovač. Aplikace má pouze ručně volaný endpoint a funkci použitou v testech.

**Vztah k zadání:** schvalovací změna v bodu 12 zahrnuje vypršení a jeho dopad. Konkrétní scheduler, hodinová hranice ani kontrola po sekundě předepsané nejsou. Chování expirace musí být podle zvolené politiky předveditelné; nestačí jej celé odstranit jako „až C03“ a tvrdit hotovou v0.2.

### Varianta A — zachovat současný slib automatického spouštění

Před — import v `src/index.ts`:

```ts
import { initializeDatabase } from './service';
```

Po — jednoduchý návrh pro jeden proces prototypu:

```ts
import { initializeDatabase, expirePendingReservations } from './service';

// Návrh nastavení prototypu; musí být přijat a popsán, není ze zadání.
const EXPIRY_CHECK_INTERVAL_MS = 1_000;

async function checkExpiredReservations(): Promise<void> {
  try {
    await expirePendingReservations();
  } catch (error) {
    console.error('Kontrola expirací selhala:', error);
  } finally {
    setTimeout(() => {
      void checkExpiredReservations();
    }, EXPIRY_CHECK_INTERVAL_MS);
  }
}
```

Po úspěšném `await initializeDatabase()` přidat `void checkExpiredReservations()` právě jednou. Běhy se nepřekrývají a po chybě pokračují. Produkční správa procesů a ukončování workerů nejsou tímto návrhem vyřešené.

Text požadavku zpřesnit: od hranice `start - 1h` je žádost určena k expiraci; změna se provede při nejbližší úspěšné kontrole za běhu aplikace. Neslibovat změnu přesně na milisekundu. Po restartu první kontrola zpracuje i staré čekající žádosti.

Ověřit skutečný přechod bez kliknutí na tlačítko nebo volání endpointu; také uvolnění dostupnosti/limitu a kontrolu po restartu.

### Varianta B — vědomě vymezit demonstrační rozsah

Před:

```text
Systémový plánovač periodicky kontroluje nerozhodnuté žádosti.
```

Po — návrh ke schválení týmem, ne tvrzení o již přijaté baseline:

```text
V demonstrační aplikaci se kontrola expirací vyvolává příkazem
POST /api/reservations/expire nebo ověřovacím scénářem.
Při kontrole systém převede způsobilé PENDING_APPROVAL na EXPIRED
a uvolní jejich blokaci i limit. Automatické spouštění na pozadí
není součástí této demonstrační verze.
```

Pak stejným způsobem změnit REQ-13, V-25/V-26, aktéra/spouštěč v diagramech, README, ROADMAP i evidenci. Je třeba odlišit spouštěcí příkaz od produkčního business oprávnění. Dokud tým tuto úpravu rozsahu nepřijme, platí původní slib automatického chování.

## 9. ROZHODNOUT — oznámení a retry jsou silnější slib než implementace

**Kde:** [docs/reservation-specification.md:495](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:495), [src/service.ts:584](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/service.ts:584), [src/notification.ts:6](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/notification.ts:6). Retry je slíben v REQ-06, REQ-08 a BR-06; obdobné tvrzení obsahuje Project Frame.

**Nesoulad:** Approve/Reject ukládá outbox záznam, ale nepředává jej odesílači. Totéž platí pro některá oznámení správci. Neexistuje dispatcher/retry. Výchozí odesílač navíc pouze simuluje úspěch.

**Vztah k zadání:** C01 požaduje jednu systémovou hranici/dependency, kterou jsme zvolili jako Notification Service. C02 nepřikazuje produkční e-mail, konkrétní retry algoritmus ani synchronní volání odesílače po schválení. Vlastní přijaté sliby ale nesmějí být vydávané za implementované.

Před:

```text
REQ-10/REQ-11: ... odešle oznámení studentovi.
REQ-06/REQ-08: ... později jeho předání zopakuje.
```

Po — možná užší specifikace, pouze pokud ji tým přijme:

```text
Při rozhodnutí správce systém ve stejné transakci uloží právě jeden
požadavek na oznámení studentovi do notifications_outbox.
Samotné doručení těchto oznámení není součástí této baseline.

U operací s pokusem o předání simulovanému odesílači se při selhání
zachová business změna, vrátí varování a záznam označí FAILED.
Automatické opakování předání zatím není implementováno.
```

Upravit tomu i příklady typu „student obdrží oznámení“, BR-06, Project Frame a evidenci. Označení `SENT` u stubu vysvětlit jako úspěšné předání simulaci, nikoli skutečný e-mail.

**Alternativa při zachování slibu:** doplnit předávání všech příslušných outbox zpráv testovatelnému odesílači a opakované zpracování neúspěšných zpráv. Nestačí přidat jeden `sendNotification()` do Approve a označit celý retry za vyřešený. Při souběhu okamžitého odesílání a workeru musí mít doručování společné řízení, jinak může dojít ke dvěma pokusům současně. Nezaměňovat „právě jeden požadavek na oznámení“ za garanci právě jednoho externího doručení.

**Malý ověřitelný stub místo produkčního e-mailu:**

```ts
const delivered: Array<{ recipient: string; message: string }> = [];

setNotificationSender(async (recipient, message) => {
  delivered.push({ recipient, message });
});

// Spustit operaci, která má podle přijaté specifikace předat oznámení.
// Ověřit příjemce, zprávu, počet předání a stav outboxu skutečným assert.
// V finally obnovit resetNotificationSender().
```

Tento snippet pouze umožňuje pozorovat předání. Sám neopravuje chybějící volání ani nevytváří retry mechanismus.

## 10. ROZHODNOUT — simulovaná identita není autentizace

**Kde:** [src/app.ts:174](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/src/app.ts:174), předpoklad OP-05 na [docs/reservation-specification.md:500](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/reservation-specification.md:500). Podobně klient dodává `user_id` pro vlastnictví rezervací.

Před — skutečný kód:

```ts
const userRole = (req.headers['x-user-role'] as string) || req.body.role;
```

Před — silnější tvrzení specifikace:

```text
Uživatel je autentizován v roli Správce křečka.
```

**Proč je to problém:** kdokoli, kdo může volat API, si může dodat `MANAGER`. Kontrola hodnoty role demonstruje rozhodování podle role, nikoli ověření skutečné identity.

**Vztah k zadání:** oprávněná schvalující osoba je povinná v bodu 12. Školní přihlášení, OAuth, JWT ani konkrétní IdP předepsané nejsou.

Po — možné pravdivé vymezení řízené demonstrace, ke schválení týmem:

```text
V řízené demonstrační aplikaci je identita a role simulována
testovacím vstupem. Na této důvěryhodné testovací hodnotě se ověřuje
povolení a odmítnutí operace podle role a vlastnictví rezervace.
API neověřuje totožnost skutečného uživatele a není určeno
k veřejnému provozu. Produkční autentizace není implementována.
```

**Proč takto:** umožní předvést pravidlo v kontrolovaném prostředí, aniž bychom tvrdili, že je API zabezpečené. Tento text nezabezpečuje nedůvěryhodné klienty a nemůže sloužit jako oprava pro veřejné nasazení. Pokud je cílem skutečná ochrana API, roli a identitu musí dodávat důvěryhodná serverová autentizace, ne libovolná hlavička klienta.

Ověřit odmítnutí studentské role a cizího vlastnictví v demo scénářích. U Availability tým zvlášť rozhodne, zda má být veřejná: povinnost přihlášení pro čtecí dotaz jsme si přidali sami. Podle volby sjednotit REQ-04, předpoklady a scénář.

Testovací `x-current-time` na řádku 20 také popsat jako demo/testovací možnost, ne jako bezpečně důvěryhodný systémový čas veřejného API. Čas v okamžiku přijetí versus rozhodnutí musí odpovídat zvolené politice; libovolný čas klienta ji v běžném režimu nesmí obcházet.

## 11. BEZPEČNOST — ověřit změnu historického DB hesla

**Kde:** historie `.env.example`, commit `6141794`; při předchozí kontrole [PR č. 5](https://github.com/tomaskirnig/SWI_2027/pull/5) bylo dohledáno upozornění GitGuardian na PostgreSQL credentials. Aktuální šablona již obsahuje placeholdery.

**Proč je to problém:** odstranění hodnoty z nejnovějšího souboru ji neodstraní z Git historie. Platnost hesla nebyla zkoušena.

Před — problémový princip, skutečné heslo zde záměrně není:

```dotenv
DATABASE_URL=postgresql://USER:SKUTECNE_HESLO@HOST:5432/DATABASE
```

Po — šablona bez tajných údajů:

```dotenv
DATABASE_URL=postgresql://USER:YOUR_PASSWORD@HOST:5432/DATABASE
```

**Skutečná oprava:** pokud šlo o platné heslo, které dosud nebylo změněno, změnit je u databázového poskytovatele a aktualizovat lokální neveřejnou konfiguraci oprávněných členů. Změna šablony sama nestačí. Pokud už bylo heslo změněno, tuto skutečnost pouze ověřit; nevyžadovat další rotaci bez důvodu.

Neprovádět automatický přepis historie nebo force-push do společného repozitáře. To vyžaduje samostatnou domluvu s týmem. Nejde o speciální požadavek C02, ale o bezpečnost používané databáze.

## Co nyní nepřidávat pouze kvůli auditu

- Produkční e-mailovou službu, kompletní IdP nebo samostatné workery bez rozhodnutí o rozsahu.
- Repository/Unit of Work ani přestavbu vrstev před porovnáním variant v C03.
- Automatické posouvání termínů nebo expiraci DRAFT, pokud je tým nechce.
- Novou politiku opakovaného Cancel: idempotentní úspěch je zadáním dovolený.
- Požadavek na přesně 30 testů: zadání toto číslo neurčuje.
- Povinný GitHub approval: požadované je skutečné schválení týmem, forma není předepsaná.
- HTTP E2E walking skeleton jako dodatečnou povinnost před dokončením C02. C01 jej stanovuje runnable až po C03 / před C04. Dokumentace však musí pravdivě říkat, jestli takový test dnes existuje.

U současné C03 části A jen zpřesnit faktické tvrzení v [docs/architecture-and-decisions.md:340](C:/Users/kalus/Desktop/HamsterProject/SWI_2027/docs/architecture-and-decisions.md:340): čisté funkce v `domain.ts` již lze testovat bez PostgreSQL; s DB je svázaná především orchestrace a perzistence scénáře. Stub označit jako stub a nalezené rozdíly zapsat. Zbytek C03 není chybou dokončeného C02.

## Doporučené pořadí práce

1. Ověřit, zda bylo změněno případně uniklé skutečné heslo.
2. Opravit assertions; nesnažit se znovu dokazovat správnost rozbitými assertions.
3. Rozhodnout skutečný rozsah expirace, oznámení a identity. Neodstraňovat přijaté požadavky potichu jen kvůli chybějícímu kódu.
4. Podle rozhodnutí sjednotit specifikaci, doplnit OP-05, analýzu dopadu a diagramy.
5. Provést a zaznamenat revizi změněných/nových požadavků a skutečné týmové schválení.
6. Znovu ověřit přijaté chování na testovací DB, případné rozdíly vyřešit a aktualizovat evidence/README/ROADMAP s přesnou verzí.
7. Pokračovat architektonickými kroky C03; kód měnit podle přijaté delty, ne preventivně.

Tyto poznámky nejsou potvrzením „100 % hotovo“. Takové potvrzení vyžaduje vyřešená rozhodnutí, skutečné ověření a pravdivou evidenci výsledku.
