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

## C08 – CR-08-01: Čas rozhodnutí při potvrzení a schválení rezervace

**Stav** Schváleno – varianta A.  
**Zdroj požadavku** Nález F1 z [C06](evidence-and-evolution.md#c06-internal-evidence-assessment).  
**Výchozí verze** `c39d54feda198c78c1b330ce3008f2eb6e83ae97`.  
**Základ požadavku** [Specifikace v0.2](reservation-specification.md), zejména REQ-05, REQ-10, REQ-11 a BR-03.

### Problém a požadované chování

Confirm a Decide používají čas získaný před čekáním na databázové zámky. Ve výchozí verzi proto může požadavek dorazit včas, překročit lhůtu během čekání a přesto uspět. Časová podmínka se má vyhodnotit v okamžiku rozhodnutí po získání potřebných zámků.

Návrh zahrnuje OP-03 Confirm a OP-05 Decide, tedy Approve i Reject. U OP-04 Cancel se prověří stejný vzor a případná oprava se posoudí samostatně. F2, výpočet denního limitu v UI, je samostatný nález.

### Akceptační podmínky

| ID | Podmínka | Očekávaný výsledek |
|---|---|---|
| AC-01 | Confirm rozhodne přesně 15 minut před začátkem a všechny ostatní podmínky platí. | Operace uspěje a uloží stav odpovídající typu křečka. |
| AC-02 | Confirm je zahájen včas, ale po čekání na zámek rozhodne 1 ms po lhůtě. | HTTP 400. Rezervace zůstane `DRAFT` a nevznikne položka v outboxu. |
| AC-03 | Decide rozhodne 1 ms před hodinovou hranicí a všechny ostatní podmínky platí. | Approve uloží `CONFIRMED`, Reject uloží `REJECTED`. V obou případech vznikne právě jedna položka v outboxu. |
| AC-04 | Decide je zahájeno včas, ale rozhodne přesně na hranici jedné hodiny před začátkem nebo později. | HTTP 400 pro Approve i Reject. Samotné Decide nezmění stav ani outbox. V izolovaném testu bez běžící expirace zůstane rezervace `PENDING_APPROVAL`. |
| AC-05 | Dva platné Confirm požadavky soupeří o překrývající se interval stejného křečka. | Nejvýše jeden může uspět. Uložené rezervace respektují BR-02. |

### Dopady změny

| Oblast | Dopad a způsob ověření |
|---|---|
| Specifikace a stavy | Platné lhůty a stavové přechody zůstávají podle v0.2. Regrese ověří obě časové hranice a uložený stav. |
| Aplikační služba a HTTP | V [service.ts](../src/service.ts) a [app.ts](../src/app.ts) je potřeba prověřit předávání času tak, aby se při běžném požadavku odečetl až při rozhodnutí. Stávající testovací mechanismus musí dál umožnit deterministické scénáře. |
| Databáze a transakce | Ověřit stávající pořadí zámků a zápis stavu s outboxem v jedné transakci. Pro doporučenou variantu se nepředpokládá změna schématu. |
| Návrh a verifikace | Po výběru řešení aktualizovat příslušné sekvence a kontrakty. Spustit hraniční testy, test skutečného čekání na PostgreSQL zámek a regresi BR-02. |

### Varianty a rozhodnutí

| Varianta | Přínos | Náklady a ověření |
|---|---|---|
| A · Zdroj času předávaný do služby | Služba odečte čas po potřebných zámcích a test může použít řízené hodiny. | Upravit předávání času v dotčených cestách a ověřit hranice i skutečné čekání na zámek. |
| B · Aktuální čas z PostgreSQL po získání zámků | Rozhodnutí vychází z hodin databáze uvnitř transakce. | Vyžaduje další DB dotaz nebo úpravu existujícího dotazu. Je potřeba vyřešit řízení času v testech a ověřit, že se čte aktuální čas, nikoli čas začátku transakce. |

**Doporučená varianta** A. Drží rozhodnutí v aplikační službě a umožňuje přesně testovat časové hranice. Bez opravy může požadavek při čekání nadále projít po lhůtě.
**Vlastník návrhu** Dennis Carnevale, podle přiřazení R-01.

**Týmová revize a rozhodnutí** Tomáš Kirnig dne 19. 11. 2026 schválil variantu A pro operace Confirm a Decide.