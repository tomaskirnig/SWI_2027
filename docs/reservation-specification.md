# Návrh Specification Baseline v0.1

Tento dokument je pracovní návrh baseline v0.1. Za schválenou týmovou baseline bude označen až po revizi požadavků, doplnění společných pravidel a diagramů a kontrole jejich vzájemné konzistence.

## 1. Čtyři základní operace

Minimální verze systému Křečkomat pracuje se čtyřmi základními operacemi. Rezervovaným prostředkem je konkrétní školní křeček a uživatelem je student. Operace `Approve Reservation` není součástí baseline v0.1; případný schvalovací proces bude řešen až při změně požadované v části B zadání C02.

## OP-01 — Create Reservation — Vytvořit rezervaci

**Cíl / hodnota pro uživatele:**

Student zaznamená svůj záměr rezervovat konkrétního křečka na určitý čas. Vznikne návrh, se kterým lze dále pracovat, aniž by zatím blokoval ostatní studenty.

**Spouštěcí událost:**

Přihlášený student odešle požadavek obsahující identifikátor křečka, čas začátku a čas konce rezervace.

**Pozorovatelné požadavky:**

- **REQ-01:** Pokud student smí vytvářet rezervace, křeček existuje a je aktivní, interval je platný a požadavek při vytvoření neporušuje pravidlo překryvu ani denní limit, systém vytvoří právě jednu rezervaci ve stavu `DRAFT` a vrátí její identifikátor a stav.
- **REQ-02:** Pokud některá vstupní podmínka není splněna, systém požadavek odmítne s rozlišitelným důvodem a nevytvoří žádnou rezervaci.

**Předpoklady:**

- Student je systémem jednoznačně identifikován a smí vytvářet vlastní rezervace.
- Křeček je evidován v katalogu a je aktivní.
- Požadavek obsahuje jednoznačné časové okamžiky a platí `start < end`.
- Začátek rezervace leží v budoucnosti vůči času systému.

**Stav po úspěšném provedení:**

Existuje právě jedna nová rezervace se zadaným studentem, křečkem a intervalem ve stavu `DRAFT`. Návrh ještě křečka nealokuje, neblokuje jeho dostupnost a nečerpá denní limit.

**Změna stavu:**

`[neexistuje] → DRAFT`

**Odkaz na doménová pravidla / invarianty:**

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace.

**Hlavní úspěšný scénář:**

1. Student zadá křečka a požadovaný interval.
2. Systém ověří identitu studenta, existenci a aktivitu křečka a platnost intervalu.
3. Systém předběžně ověří dostupnost křečka a denní limit studenta pro tohoto křečka.
4. Systém uloží rezervaci ve stavu `DRAFT`.
5. Systém vrátí identifikátor rezervace a stav `DRAFT`.

**Alternativní / chybové výsledky:**

- Neidentifikovaný nebo neoprávněný student → odmítnutí bez vytvoření rezervace.
- Neexistující nebo neaktivní křeček → odmítnutí bez vytvoření rezervace.
- Chybějící, nečitelný, prázdný nebo minulý interval → odmítnutí bez vytvoření rezervace.
- Překryv s `CONFIRMED` rezervací stejného křečka → odmítnutí kvůli kolizi.
- Překročení denního limitu stejné dvojice student–křeček → odmítnutí kvůli limitu.
- Překryv pouze s rezervací `DRAFT` nebo `CANCELLED` vytvoření neblokuje.
- Úspěšné vytvoření návrhu nezaručuje jeho pozdější potvrzení; pravidla se při Confirm kontrolují znovu.

**Příklady ověření:**

- **V-01:** Aktivní Ferda, volný budoucí interval 10:00–10:20 a student bez vyčerpaného limitu → vznikne právě jeden `DRAFT` a systém vrátí jeho ID.
- **V-02:** `start == end` nebo `start > end` → odmítnutí a žádná nová rezervace.
- **V-03:** Neexistující identifikátor křečka → odmítnutí a žádná nová rezervace.
- **V-04:** Ferda má překrývající se rezervaci `CONFIRMED` → odmítnutí kvůli kolizi; stejný překryv pouze s `DRAFT` vytvoření neblokuje.
- **V-05:** Student má u Ferdy v témže dni již 20 potvrzených minut; nový nekolidující požadavek na 10 minut projde, požadavek na 11 minut je odmítnut.

**Zdůvodnění / zdroj:**

Operace vychází z Project Frame a z CP1 walking skeletonu v README. Vytvoření návrhu odděluje zaznamenání záměru od závazné alokace křečka. Předběžná kontrola kolize a limitu poskytuje okamžitou zpětnou vazbu, ale nenahrazuje opakovanou kontrolu při potvrzení.

**Předpoklad / neznámá / TBD:**

Konkrétní způsob ověření identity studenta a správa katalogu křečků zatím nejsou určeny. Specifikace předpokládá, že aplikace dostane důvěryhodnou identitu studenta a aktuální údaje o křečkovi.

## OP-02 — Check Availability — Zkontrolovat dostupnost

**Cíl / hodnota pro uživatele:**

Student zjistí, zda lze konkrétního křečka považovat za volného v požadovaném intervalu, aniž by vytvořil nebo změnil rezervaci.

**Spouštěcí událost:**

Přihlášený student odešle dotaz obsahující identifikátor křečka, čas začátku a čas konce intervalu.

**Pozorovatelné požadavky:**

- **REQ-03:** Pro existujícího aktivního křečka a platný interval systém vrátí `UNAVAILABLE`, pokud se interval překrývá s některou jeho rezervací `CONFIRMED`; jinak vrátí `AVAILABLE`. Neaktivní křeček je vždy `UNAVAILABLE`.
- **REQ-04:** Neplatný nebo neoprávněný dotaz systém odmítne s rozlišitelným důvodem. Odmítnutí není výsledkem `AVAILABLE` ani `UNAVAILABLE` a dotaz nezmění žádná data.

**Předpoklady:**

- Student je systémem jednoznačně identifikován.
- Křeček existuje.
- Požadavek obsahuje jednoznačné časové okamžiky a platí `start < end`.

**Stav po úspěšném provedení:**

Student obdrží výsledek `AVAILABLE` nebo `UNAVAILABLE` pro zadaného křečka a interval. Žádná rezervace ani křeček se nezmění.

**Změna stavu:**

Žádná.

**Odkaz na doménová pravidla / invarianty:**

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-05 — význam stavů rezervace.

**Hlavní úspěšný scénář:**

1. Student zadá křečka a interval.
2. Systém ověří identitu studenta, existenci křečka a platnost intervalu.
3. Systém zjistí aktivitu křečka a vyhledá jeho překrývající se rezervace `CONFIRMED`.
4. Systém vrátí `AVAILABLE`, pokud je křeček aktivní a žádný překryv neexistuje; jinak vrátí `UNAVAILABLE`.
5. Systém nezmění žádná data.

**Alternativní / chybové výsledky:**

- Neidentifikovaný student, neexistující křeček nebo neplatný interval → odmítnutí bez změny dat.
- Neaktivní křeček → `UNAVAILABLE`.
- Překryv s alespoň jednou rezervací `CONFIRMED` stejného křečka → `UNAVAILABLE`.
- Překryv pouze s rezervacemi `DRAFT` nebo `CANCELLED` dostupnost neblokuje.
- Vyčerpaný osobní denní limit studenta nemění dostupnost křečka; dostupnost prostředku není příslibem, že konkrétní student může rezervaci potvrdit.
- Výsledek je okamžitý pohled a nedrží křečka. Pozdější Confirm musí dostupnost ověřit znovu.

**Příklady ověření:**

- **V-06:** Aktivní Ferda bez potvrzené rezervace v intervalu 10:00–10:30 → `AVAILABLE`, data beze změny.
- **V-07:** Ferda má `CONFIRMED` rezervaci 10:00–10:20; dotaz 10:10–10:30 → `UNAVAILABLE`.
- **V-08:** Ferda má `CONFIRMED` rezervaci 10:00–10:20; dotaz 09:40–10:00 nebo 10:20–10:40 → `AVAILABLE`, protože intervaly se pouze dotýkají.
- **V-09:** Překrývající se rezervace je pouze `DRAFT` nebo `CANCELLED` → `AVAILABLE`, pokud je Ferda aktivní.
- **V-10:** Neexistující křeček nebo `start == end` → odmítnutí bez změny dat.

**Zdůvodnění / zdroj:**

Operace vychází z Project Frame a ze společného pravidla, že čas křečka blokují pouze potvrzené rezervace. Samostatný dotaz dává studentovi informaci, ale nevytváří dočasnou alokaci ani garanci budoucího výsledku.

**Předpoklad / neznámá / TBD:**

Není zatím rozhodnuto, zda má uživatelské rozhraní u výsledku `UNAVAILABLE` zveřejnit pouze stav, nebo také volné alternativní intervaly. Baseline vyžaduje pouze výsledek dostupnosti.

## OP-03 — Confirm Reservation — Potvrdit rezervaci

**Cíl / hodnota pro uživatele:**

Platný návrh rezervace se stane závaznou alokací křečka pro studenta.

**Spouštěcí událost:**

Přihlášený student požádá o potvrzení své rezervace podle jejího identifikátoru.

**Pozorovatelné požadavky:**

- **REQ-05:** Systém potvrdí vlastní rezervaci `DRAFT` pouze tehdy, když křeček existuje a je aktivní, začátek ještě nenastal, interval nekoliduje s jinou rezervací `CONFIRMED` stejného křečka a potvrzením nebude překročen denní limit stejné dvojice student–křeček.
- **REQ-06:** Při úspěchu systém změní tutéž rezervaci na `CONFIRMED`, vrátí její identifikátor a stav a předá oznámení Notification Service. Při nesplnění podmínky požadavek odmítne s rozlišitelným důvodem a rezervaci tímto požadavkem nezmění.
- **REQ-07:** Při souběžných potvrzeních musí zůstat zachován zákaz překryvu i denní limit; dva konfliktní návrhy nesmějí oba přejít do `CONFIRMED`.

**Předpoklady:**

- Rezervace existuje a patří přihlášenému studentovi.
- Rezervace je ve stavu `DRAFT`.
- Dostupnost, aktivita křečka, čas a denní limit se vyhodnocují znovu při rozhodnutí o potvrzení.

**Stav po úspěšném provedení:**

Rezervace je uložena jako `CONFIRMED`, blokuje interval daného křečka a její příslušné části se započítávají do denního limitu studenta pro tohoto křečka.

**Změna stavu:**

`DRAFT → CONFIRMED`

**Odkaz na doménová pravidla / invarianty:**

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace; BR-06 — předání oznámení.

**Hlavní úspěšný scénář:**

1. Student odešle identifikátor vlastní rezervace `DRAFT`.
2. Systém ověří identitu, vlastnictví rezervace a její aktuální stav.
3. Systém znovu ověří čas, aktivitu a dostupnost křečka a denní limit.
4. Systém atomicky změní stav rezervace na `CONFIRMED` tak, aby invarianty platily i při souběhu.
5. Systém předá oznámení Notification Service.
6. Systém vrátí identifikátor rezervace a stav `CONFIRMED`.

**Alternativní / chybové výsledky:**

- Neexistující rezervace nebo pokus jiného studenta → odmítnutí bez změny dat.
- Stav `CONFIRMED` nebo `CANCELLED` → odmítnutí kvůli nepřípustnému výchozímu stavu.
- Neaktivní nebo neexistující křeček → odmítnutí; rezervace zůstane `DRAFT`.
- Začátek rezervace nastal nebo uplynul → odmítnutí; rezervace zůstane `DRAFT`.
- Od vytvoření návrhu vznikla kolize nebo byl vyčerpán denní limit → odmítnutí; rezervace zůstane `DRAFT`.
- Při souběhu konfliktních potvrzení může uspět nejvýše jedno; ostatní zůstanou `DRAFT`.

**Příklady ověření:**

- **V-11:** Vlastní platný `DRAFT`, aktivní Ferda, žádná kolize a dostatečný limit → stejná rezervace přejde do `CONFIRMED`, začne blokovat čas a vznikne požadavek na oznámení.
- **V-12:** Po vytvoření návrhu jiný student potvrdil překrývající se rezervaci Ferdy → Confirm je odmítnut a návrh zůstane `DRAFT`.
- **V-13:** Student má u Ferdy v daném dni potvrzených 20 minut a potvrzuje další nekolidující návrh na 11 minut → odmítnutí kvůli limitu, stav zůstane `DRAFT`.
- **V-14:** Dva studenti současně potvrzují překrývající se návrhy stejného křečka → nejvýše jeden skončí jako `CONFIRMED`.
- **V-15:** Pokus potvrdit `CANCELLED` nebo již `CONFIRMED` rezervaci → odmítnutí bez změny stavu a bez nového oznámení.

**Zdůvodnění / zdroj:**

Operace vychází z přechodu `DRAFT → CONFIRMED` v Project Frame. Právě Confirm vytváří závaznou alokaci; proto musí znovu ověřit pravidla a zachovat je i při souběhu.

**Předpoklad / neznámá / TBD:**

Je třeba týmově rozhodnout, zda selhání Notification Service ponechá úspěšně potvrzenou rezervaci a vrátí varování, nebo zda se použije jiná pozorovatelná politika. Do tohoto rozhodnutí nelze výsledek REQ-06 při selhání oznámení považovat za uzavřený.

## OP-04 — Cancel Reservation — Zrušit rezervaci

**Cíl / hodnota pro uživatele:**

Student odvolá vlastní návrh nebo potvrzenou rezervaci a u potvrzené rezervace uvolní čas křečka pro ostatní.

**Spouštěcí událost:**

Přihlášený student požádá o zrušení své rezervace podle jejího identifikátoru.

**Pozorovatelné požadavky:**

- **REQ-08:** Systém změní vlastní rezervaci ve stavu `DRAFT` nebo `CONFIRMED` na `CANCELLED`, pokud požadavek rozhodne před časem jejího začátku. Záznam ani jeho identifikátor nesmaže, vrátí identifikátor a nový stav a předá oznámení Notification Service.
- **REQ-09:** Neexistující, cizí nebo již započatá rezervace vede k odmítnutí s rozlišitelným důvodem a bez změny rezervace. Opakované zrušení vlastní rezervace `CANCELLED` je idempotentní úspěch bez další změny a bez dalšího oznámení.

**Předpoklady:**

- Rezervace existuje a patří přihlášenému studentovi.
- Pro nový přechod do `CANCELLED` je rezervace ve stavu `DRAFT` nebo `CONFIRMED`.
- Čas systému je při rozhodnutí o změně stavu menší než čas začátku rezervace.

**Stav po úspěšném provedení:**

Rezervace zůstává uložená pod stejným ID ve stavu `CANCELLED`. Neblokuje dostupnost křečka a nezapočítává se do denního limitu.

**Změna stavu:**

`DRAFT → CANCELLED` nebo `CONFIRMED → CANCELLED`; při opakovaném zrušení `CANCELLED → CANCELLED` bez nové změny.

**Odkaz na doménová pravidla / invarianty:**

BR-03 — politika rušení; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace; BR-06 — předání oznámení.

**Hlavní úspěšný scénář:**

1. Student odešle identifikátor vlastní rezervace.
2. Systém ověří identitu, vlastnictví, aktuální stav a časovou podmínku rušení.
3. Systém změní stav rezervace na `CANCELLED` a zachová její ostatní údaje.
4. Systém předá oznámení Notification Service.
5. Systém vrátí identifikátor rezervace a stav `CANCELLED`.

**Alternativní / chybové výsledky:**

- Neexistující rezervace nebo pokus jiného studenta → odmítnutí bez změny dat.
- Čas začátku již nastal nebo uplynul → odmítnutí a zachování původního stavu.
- Vlastní rezervace je již `CANCELLED` → úspěch se stejným ID a stavem, ale bez nové změny a bez dalšího oznámení.
- Neaktivita křečka zrušení neblokuje.
- Pokud Cancel a Confirm stejného návrhu probíhají souběžně před začátkem, oba výsledky musejí odpovídat jednomu pořadí změn. Cancel může přejít z `DRAFT` i `CONFIRMED` do `CANCELLED`; konečný stav po úspěšném Cancel je vždy `CANCELLED`.

**Příklady ověření:**

- **V-16:** Vlastní `DRAFT` před začátkem → stejná rezervace přejde do `CANCELLED` a vznikne jeden požadavek na oznámení.
- **V-17:** Vlastní `CONFIRMED` před začátkem → `CANCELLED`; interval přestane blokovat dostupnost a přestane čerpat denní limit.
- **V-18:** Vlastní `CONFIRMED` přesně v čase začátku nebo po něm → odmítnutí a zachování `CONFIRMED`.
- **V-19:** Opakované zrušení vlastní `CANCELLED` → úspěch se stavem `CANCELLED`, žádná další změna ani nové oznámení.
- **V-20:** Jiný student se pokusí rezervaci zrušit → odmítnutí bez změny stavu.

**Zdůvodnění / zdroj:**

Operace vychází z přechodů do `CANCELLED` v Project Frame. Uchování záznamu zachovává historii a jednoznačně odlišuje zrušenou rezervaci od neexistující. Hranice „před začátkem“ poskytuje ověřitelnou politiku rušení pro návrh baseline.

**Předpoklad / neznámá / TBD:**

Politika `currentTime < start` a idempotentní opakované zrušení jsou návrhy k potvrzení týmem při revizi. Stejně jako u Confirm je nutné rozhodnout pozorovatelný výsledek při selhání Notification Service.
