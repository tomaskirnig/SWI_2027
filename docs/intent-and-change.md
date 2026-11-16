# Project Frame

## Reservation domain

Rezervujeme školního křečka na konkrétní časový interval. Každý křeček je samostatný rezervovatelný prostředek, který si může student zamluvit.

## Purpose

Systém slouží studentům, kteří si chtějí rezervovat školního křečka na omezený čas. Cílem je zabránit kolizím rezervací a jednoduše spravovat jejich vytvoření, potvrzení a zrušení.

## Users / Stakeholders

* Student
* Správce systému
* Správce křečků

## Core concepts

* Rezervace
* Křeček
* Uživatel
* Stav rezervace

## Core operations

* Vytvořit rezervaci
* Potvrdit rezervaci
* Zrušit rezervaci
* Zkontrolovat dostupnost

## Persistent state

O rezervaci ukládáme:

* ID rezervace
* ID uživatele
* ID křečka
* čas začátku rezervace
* čas konce rezervace
* stav rezervace

O křečkovi ukládáme:

* ID křečka
* jméno křečka
* stav dostupnosti

## State-changing operation

DRAFT → CONFIRMED

Rezervace je nejprve vytvořena ve stavu DRAFT, který ještě neblokuje čas křečka. Samostatná operace potvrzení znovu ověří dostupnost a denní limit. Při splnění pravidel rezervace přejde do stavu CONFIRMED a systém odešle oznámení; při nesplnění zůstane ve stavu DRAFT. Kontrola pravidel a potvrzení musí zabránit kolizi i při souběžných požadavcích.

Další možné přechody:

* DRAFT → CANCELLED
* CONFIRMED → CANCELLED

## Common business rule

Dvě potvrzené rezervace stejného křečka se nesmí časově překrývat.

## Domain-specific business rule

Pro každou dvojici student–křeček smí součet potvrzených rezervací (`CONFIRMED`) činit nejvýše 30 minut za kalendářní den v časovém pásmu `Europe/Prague`. Při potvrzení se započítává i potvrzovaná rezervace; stavy `DRAFT` a `CANCELLED` limit nečerpají. U rezervace přes půlnoc se do každého dne započítá jen část, která do něj spadá.

## External / system boundary

Hranice pro předání oznámení, v současném prototypu simulovaná přes NotificationSender.

Po skutečném přechodu rezervace do stavu `CONFIRMED` nebo `CANCELLED` systém vytvoří požadavek na oznámení uživateli. Selhání doručení stav rezervace nevrací zpět; při přímém pokusu po Confirm/Cancel systém vrátí varování a zprávu ponechá jako FAILED. Výsledky schválení a expirace se evidují jako PENDING v outboxu. Automatický dispatcher ani retry worker nejsou implementované.

## Assumption

Předpokládáme, že každý student má školní e-mailovou adresu, na kterou lze doručovat oznámení o rezervacích. Dostupnost těchto adres je potřeba ověřit před napojením Notification Service.

## Unknown

Baseline v0.1 vyřešila původní neznámou způsobu potvrzení: student spustí Confirm a systém rezervaci potvrdí automaticky, pokud jsou splněna pravidla. Zbývající neznámou jsou provozní parametry opakování nedoručených oznámení, zejména interval a maximální počet pokusů.

## Rozšíření po C02/C03

V baseline v0.2 blokují termín a čerpají limit CONFIRMED i PENDING_APPROVAL. REJECTED, EXPIRED a CANCELLED obě omezení uvolňují. Confirm používá čistou ConfirmationPolicy; perzistenci a transakce vlastní repository. OP-02 je veřejný čtecí dotaz. Konkrétní integrace školní identity a e-mailového providera zůstává mimo demonstrační rozsah.

## C08 / CR-08 Rozhodný čas při změně stavu rezervace

**Zdroj a potřeba.** Nález [F1 z C06](evidence-and-evolution.md#verified-findings) a přijaté pravidlo [BR-01](reservation-specification.md#br-01--význam-časového-intervalu) určují, že rozhoduje systémový čas v okamžiku vyhodnocení operace. Student ani správce nemá získat platný přechod po lhůtě jen díky tomu, že se požadavek dostal do fronty dříve. Změna řeší [riziko R-01](evidence-and-evolution.md#r-01-aplikace-může-při-čekání-přijmout-pozdní-potvrzení).

**Výchozí verze.** `c39d54feda198c78c1b330ce3008f2eb6e83ae97`, [stavový diagram v0.2](../DIAGRAMS.md#21-aktualizovaný-stavový-diagram-životního-cyklu-v02) a specifikace v0.2 ([OP-03, REQ-05](reservation-specification.md#op-03--confirm-reservation--potvrdit-rezervaci), [OP-04, REQ-08](reservation-specification.md#op-04--cancel-reservation--zrušit-rezervaci), [OP-05, REQ-10 a REQ-11](reservation-specification.md#43-op-05--approve--reject-reservation--rozhodnout-o-rezervaci)). Architektonickým východiskem je [ADR-01](architecture-and-decisions.md#adr-01--umístění-a-vlastnictví-delayed-approval-workflow-a-časovače-expirací), transakce a zámky v [repository](../src/repository.ts) a Confirm policy v [doméně](../src/domain.ts). Samostatně číslovaná migrace pro tuto baseline neexistuje. DB se inicializuje podle `initializeDatabase()` z téhož commitu. [Prostředí a příkazy](../README.md#ověření-lhůty-confirm-pro-c08).

**Pozorované chování.** API odečte čas při přijetí požadavku a předá jej službě. Confirm na výchozí verzi po skutečném čekání na zámek překročil lhůtu, přesto odpověděl `200` a uložil `CONFIRMED` i oznámení. C06 dříve reprodukovalo vzor Confirm a Decide se simulovaným čekáním. Stejný průchod staré hodnoty času je v kódu Cancel. [Integrační výsledek pro Confirm](evidence-and-evolution.md#tc-c08-02--zámek-uvolněný-po-lhůtě) · [HTTP API](../src/app.ts) · [Služba](../src/service.ts).

**Cílové chování a rozsah.** Vyhodnotit lhůtu Confirm, Decide a nového Cancel podle času těsně před rozhodnutím, po získání potřebných zámků a načtení podkladů. Při odmítnutí se stav rezervace ani outbox touto operací nezmění. Idempotentní Cancel zůstává úspěšný i po lhůtě. F2 (denní limit ve webu), automatická expirace OP-06 a volba způsobu doručování oznámení jsou mimo rozsah CR-08.

**Zdroj času.** Akceptační podmínky pro běžný provoz platí pro požadavky bez `x-current-time`. Přesné hrany se v testech ověřují řízeným časem. Baseline přijímá platnou hodnotu `x-current-time` bez omezení na testovací prostředí. Omezení této hlavičky mimo testy je samostatné rozhodnutí mimo CR-08. Integrační pokusy, které prokazují překročení lhůty při čekání, posílají požadavky bez této hlavičky.

### Akceptační podmínky

| ID | Pozorovatelný výsledek |
|---|---|
| AC-01 | Platná přímá rezervace se potvrdí, pokud rozhodnutí nastane před lhůtou nebo přesně v čase `start - 15 min`. Po přechodu je stav `CONFIRMED` a pro studenta vznikne jeden outbox záznam. |
| AC-02 | Pokud Confirm během čekání na zámek překročí lhůtu, API vrátí `400` s důvodem předstihu. Samostatné čtení DB potvrdí `DRAFT` a původní outbox. Odmítnutí platí i 1 ms po hranici. |
| AC-03 | Decide u oprávněného správce dodrží hranici `currentTime < start - 1h` pro Approve i Reject. Rozhodnutí přesně na hranici nebo později se odmítne bez změny stavu či outboxu touto operací. U platného včasného požadavku fungují dosavadní přechody. |
| AC-04 | Nové Cancel vlastní rezervace ve stavu `DRAFT`, `CONFIRMED` nebo `PENDING_APPROVAL` při překročení hranice `start - 15 min` čekáním na zámek odmítne změnu a zachová stav i outbox. Přesně na hranici je při splnění dalších podmínek přípustné. Opakované Cancel vlastní `CANCELLED` vrátí idempotentní úspěch bez dalšího oznámení. |
| AC-05 | Nadále platí ochrana proti překryvu, denní limit, oprávnění a transakční uložení změny s outboxem. Existující platné operace se stejnými vstupy a rozhodným časem vykazují stejné výsledky. |

### Matice dopadů

| Oblast a artefakt | Dopad a důvod | Akce a důkaz |
|---|---|---|
| Specifikace a stavy · [BR-01, BR-03 a OP-03 až OP-05](reservation-specification.md) | CHECK. Význam rozhodného času i inkluzivita hranic jsou přijaté. Stavový model má stejné přechody. | Při review porovnat AC s příslušnými pravidly a doložit hraničními a negativními výsledky. |
| Architektura a detailní návrh · [C03 H1 a C05](architecture-and-decisions.md) | CHANGE. Sekvence dnes zobrazuje předání již odečteného času z API. Policy dál vyhodnocuje vstupy, služba určí správný okamžik odečtu. | Aktualizovat kontrakt a sekvenci po rozhodnutí. Review zkontroluje pořízení času po relevantních zámcích a před rozhodnutím. |
| Aplikační kód a API · [app.ts](../src/app.ts), [service.ts](../src/service.ts), [domain.ts](../src/domain.ts) | CHANGE/CHECK. Potřeba změnit předávání času a jeho odběr. Pozorovatelné odpovědi, role a těla požadavků mají dosavadní kontrakt. | Prověřit Confirm, Decide včetně zámku křečka a nový Cancel. Zachovat možnost řídit čas v testech a nezvětšovat rozsah existujícího testovacího override. |
| Data, transakce a historické záznamy · [repository.ts](../src/repository.ts) | CHECK. U varianty A zůstává schéma i postup uzamčení. Změní se, zda se pozdní přechod zapíše. NO IMPACT na schéma a migraci, historické stavy se automaticky nepřepočítají. | Po odmítnutí použít nový DB dotaz na rezervaci a outbox. Zopakovat regresi souběhu a rollbacku. |
| Testy a rizika · [C08 evidence](evidence-and-evolution.md#c08--ověření-f1-na-výchozí-verzi) a [stávající testy](../src/verify.ts) | CHANGE. Stávající pevné časy neověřují překročení lhůty během skutečného čekání. | V C09 zopakovat oba Confirm případy a přidat hrany, Decide, Cancel a relevantní stávající regrese. R-01 přehodnotit podle výsledků. |
| Konfigurace a vydání · [README](../README.md), [lockfile](../package-lock.json) | CHECK. Varianta A nepotřebuje nový runtime ani proměnnou prostředí. C09 musí identifikovat výsledný commit, prostředí a testy. | Build, automatizovaný běh s izolovanou DB, nezávislý čistý checkout a záznam kandidáta na vydání v C09. |
| Provoz a obnova · [plánovač v index.ts](../src/index.ts) | NO IMPACT na scheduler a pravidlo expirace. Oprava nemění konfiguraci ani schéma. Zápisy uskutečněné před opravou se samy nevrátí. | V C09 uvést omezení rollbacku a spustit regresi expirace. Případné dřívější chybně potvrzené rezervace posoudit jednotlivě podle dostupných důkazů. |

### Varianty a rozhodnutí

| Varianta | Pokrytí podmínek | Zásah a riziko | Důkaz a vratnost |
|---|---|---|---|
| A · Serverové hodiny odečtené ve službě po zámcích | Umožní splnit AC-01 až AC-05. Zdroj času lze řídit v testu. | Změna předání času z API a odběru ve službě. Je třeba pokrýt všechny dotčené cesty a jejich dosavadní pravidla. Bez dalšího SQL dotazu. | Deterministický test hranic a reálný HTTP/DB test čekání. Návrat k původnímu kódu obnoví staré chování a nepřepíše data. |
| B · Odečíst `clock_timestamp()` v PostgreSQL po zámcích | Pokryje úspěch a pozdní odmítnutí, pro přesné hrany a dosavadní řízení času bude potřeba testovací mechanismus. | Databáze určí společný čas. Přibude SQL volání v transakci, závislost na DB hodinách a změna kontraktu repository. `CURRENT_TIMESTAMP` by zachoval čas začátku transakce. | Reálný DB test s kontrolou časové hranice a přidané DB závislosti. Změna je vratná bez migrace, uložená data zůstávají. |

Při nečinnosti zůstane reprodukované pozdní potvrzení možné. Ruční omezení provozu v blízkosti lhůty může snížit četnost projevu, ale nedává zákaz takového přechodu v aplikaci.

**Stav rozhodnutí k 16. 11. 2026** `DEFER` do týmového review. Návrh je `ACCEPT` variantu A, protože řeší F1 v existujícím vlastníkovi pravidla a ponechává čas ovladatelný v testech. Navržený vlastník je Martin Kalus. Navržený nezávislý reviewer je Petr Gála. Otázka k review je, zda navržená místa odečtu zahrnují oba zámky u Decide a zda stejná změna správně zachová idempotentní Cancel. Review spolužákem ani jeho stanovisko zatím nejsou doložené. K rozhodnutí se tým vrátí po jeho review a zapíše jméno, datum, výsledek a vypořádání připomínky.

### Záznam peer review

Spolužák vyplní následující položky podle [návodu k peer review](review-c08.md).

- **Spolužák a datum**
- **Prověřený předpoklad a závěr**
- **Evidence** Posouzený záznam nebo vlastní běh s výsledkem
- **Připomínky a podmínky schválení**
- **Doporučení týmu** `ACCEPT` / `REJECT` / `DEFER` / `NO_CHANGE`, varianta a zdůvodnění
- **Rozhodnutí vlastníka a vypořádání připomínek**

### Předávka do C09 po schválení

- Implementovat nejmenší schválenou změnu odběru času u Confirm, Decide a nového Cancel. Aktualizovat související kontrakty a sekvence.
- Použít následující ověření. Případy s přechodem přes lhůtu spustit přes HTTP a skutečný zámek PostgreSQL bez `x-current-time`. Pro přesné hrany použít řízený čas. Stav a změnu outboxu ověřit novým DB dotazem po HTTP odpovědi. U úspěšného přechodu ověřit i adresáty nových záznamů.

| Podmínky | Test pro C09 | Očekávaný výsledek |
|---|---|---|
| AC-01, AC-02 · Confirm | Zopakovat [TC-C08-01 a TC-C08-02](evidence-and-evolution.md#c08--ověření-f1-na-výchozí-verzi). Přidat řízený čas přesně `start - 15 min` a o 1 ms později. | První případ zůstane `PASS`. Druhý přejde z `FAIL` na `PASS`. Přesně na hranici `200`, `CONFIRMED`, jeden záznam. Po hranici `400`, `DRAFT`, žádný nový záznam. |
| AC-03 · Decide | Pro `APPROVE` i `REJECT` na samostatných `PENDING_APPROVAL` rezervacích zadržet zámek křečka, dokud nepřejde lhůta. Řízeným časem ověřit také 1 ms před `start - 1h`, přesnou hranici a 1 ms po ní. Během pokusů s Decide vypnout časovač OP-06, aby stav měnila pouze zkoušená operace. | Před hranicí povolit `APPROVE → CONFIRMED` nebo `REJECT → REJECTED` a přidat jeden záznam do outboxu. Na hranici a po ní `400`, zachovat `PENDING_APPROVAL` a bez nového záznamu. |
| AC-04 · Cancel | Zopakovat Cancel vlastní rezervace `PENDING_APPROVAL` se zámkem řádku uvolněným po lhůtě a s neaktivním OP-06. Řízeným časem ověřit povolené výchozí stavy přesně `start - 15 min` a o 1 ms později. Zkusit opakované Cancel vlastní `CANCELLED` po lhůtě. | Na hranici nový Cancel uspěje a přidá jeden záznam. Po hranici vrátí `400`, stav zůstane původní a outbox se nezmění. Opakované Cancel vrátí idempotentní úspěch bez nového záznamu. |
| AC-05 · Regrese | Ověřit také platný Confirm pro křečka vyžadujícího schválení a spustit `npm run verify` na izolované DB. | Větev schvalování uloží `PENDING_APPROVAL` a dva outbox záznamy, pro studenta a správce. Projdou také případy souběhu, kolizí, denního limitu, oprávnění, atomického zápisu i expirace. |


- Zaznamenat commit změny, review, výsledky build/test/verify, skutečnou DB hranici a nezávislý čistý checkout podle C09. `R-01` zůstává se skutečným reziduálním rizikem `NOT VERIFIED`, dokud opatření neprojde kontrolou.
