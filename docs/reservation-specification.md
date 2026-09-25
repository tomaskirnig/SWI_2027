# Návrh Specification Baseline v0.1

Tento dokument je pracovní návrh baseline v0.1. Textové požadavky a společná pravidla prošly kontrolou přijetí a vzájemné konzistence. Za schválenou týmovou baseline bude dokument označen až po doplnění diagramů a kontrole jejich souladu s textem.

## 1. Čtyři základní operace

Minimální verze systému Křečkomat pracuje se čtyřmi základními operacemi. Rezervovaným prostředkem je konkrétní školní křeček a uživatelem je student. Operace `Approve Reservation` není součástí baseline v0.1; případný schvalovací proces bude řešen až při změně požadované v části B zadání C02.

## OP-01 — Create Reservation — Vytvořit rezervaci

**Cíl / hodnota pro uživatele:**

Student zaznamená svůj záměr rezervovat konkrétního křečka na určitý čas. Vznikne návrh, se kterým lze dále pracovat, aniž by zatím blokoval ostatní studenty.

**Spouštěcí událost:**

Přihlášený student odešle požadavek obsahující identifikátor křečka, čas začátku a čas konce rezervace.

**Pozorovatelné požadavky:**

- **REQ-01:** Pokud student smí vytvářet rezervace, křeček existuje a je aktivní, interval je platný, začátek leží nejpozději 15 minut v budoucnosti (`currentTime <= start - 15 min`), aktuálně se nepřekrývá s rezervací `CONFIRMED` stejného křečka a jeho případné budoucí potvrzení by podle současného stavu nepřekročilo denní limit, systém vytvoří právě jednu rezervaci ve stavu `DRAFT` a vrátí její identifikátor a stav.
- **REQ-02:** Pokud některá vstupní podmínka není splněna, systém požadavek odmítne s rozlišitelným důvodem a nevytvoří žádnou rezervaci.

**Předpoklady:**

- Student je systémem jednoznačně identifikován a smí vytvářet vlastní rezervace.
- Křeček je evidován v katalogu a je aktivní.
- Požadavek obsahuje jednoznačné časové okamžiky a platí `start < end`.
- Začátek rezervace leží alespoň 15 minut v budoucnosti vůči systémovému času (`currentTime <= start - 15 min`).

**Stav po úspěšném provedení:**

Existuje právě jedna nová rezervace se zadaným studentem, křečkem a intervalem ve stavu `DRAFT`. Návrh ještě křečka nealokuje, neblokuje jeho dostupnost a nečerpá denní limit.

**Změna stavu:**

`[neexistuje] → DRAFT`

**Odkaz na doménová pravidla / invarianty:**

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace; BR-07 — aktivita křečka.

**Hlavní úspěšný scénář:**

1. Student zadá křečka a požadovaný interval.
2. Systém ověří identitu studenta, existenci a aktivitu křečka a platnost intervalu včetně podmínky `currentTime <= start - 15 min`.
3. Systém předběžně ověří dostupnost křečka a denní limit studenta pro tohoto křečka.
4. Systém uloží rezervaci ve stavu `DRAFT`.
5. Systém vrátí identifikátor rezervace a stav `DRAFT`.

**Alternativní / chybové výsledky:**

- Neidentifikovaný nebo neoprávněný student → odmítnutí bez vytvoření rezervace.
- Neexistující nebo neaktivní křeček → odmítnutí bez vytvoření rezervace.
- Chybějící, nečitelný, prázdný, minulý interval nebo začátek méně než 15 minut v budoucnosti (`currentTime > start - 15 min`) → odmítnutí bez vytvoření rezervace.
- Překryv s `CONFIRMED` rezervací stejného křečka → odmítnutí kvůli kolizi.
- Překročení denního limitu stejné dvojice student–křeček → odmítnutí kvůli limitu.
- Překryv pouze s rezervací `DRAFT` nebo `CANCELLED` vytvoření neblokuje.
- Úspěšné vytvoření návrhu nezaručuje jeho pozdější potvrzení; pravidla se při Confirm kontrolují znovu.

**Příklady ověření:**

- **V-01:** Aktivní Ferda, volný budoucí interval s rezervací podanou včas (`currentTime <= start - 15 min`) a student bez vyčerpaného limitu → vznikne právě jeden `DRAFT` a systém vrátí jeho ID.
- **V-02:** `start == end`, `start > end` nebo termín podaný méně než 15 minut před začátkem (`currentTime > start - 15 min`) → odmítnutí a žádná nová rezervace.
- **V-03:** Neexistující identifikátor křečka → odmítnutí a žádná nová rezervace.
- **V-04:** Ferda má překrývající se rezervaci `CONFIRMED` → odmítnutí kvůli kolizi; stejný překryv pouze s `DRAFT` vytvoření neblokuje.
- **V-05:** Student má u Ferdy v témže dni již 20 potvrzených minut; nový nekolidující požadavek na 10 minut projde, požadavek na 11 minut je odmítnut.

**Zdůvodnění / zdroj:**

Operace vychází z Project Frame a z CP1 walking skeletonu v README. Vytvoření návrhu odděluje zaznamenání záměru od závazné alokace křečka. Předběžná kontrola kolize a limitu poskytuje okamžitou zpětnou vazbu, ale nenahrazuje opakovanou kontrolu při potvrzení.

**Přijatá sémantika Create:**

Tým přijímá politiku, že Create provede předběžnou kontrolu kolize a denního limitu, přestože vzniklý `DRAFT` křečka nealokuje. Cílem je odmítnout zjevně nesplnitelný požadavek co nejdříve. Úspěšný Create však dostupnost negarantuje: mezi vytvořením a potvrzením může vzniknout jiná rezervace `CONFIRMED` nebo může student vyčerpat limit, proto Confirm provede obě kontroly znovu.

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

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-05 — význam stavů rezervace; BR-07 — aktivita křečka.

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
- **V-10:** Neaktivní Ferda a platný interval → `UNAVAILABLE`; neexistující křeček nebo `start == end` → odmítnutí bez změny dat.

**Zdůvodnění / zdroj:**

Operace vychází z Project Frame a ze společného pravidla, že čas křečka blokují pouze potvrzené rezervace. Samostatný dotaz dává studentovi informaci, ale nevytváří dočasnou alokaci ani garanci budoucího výsledku.

**Přijatá sémantika dostupnosti:**

OP-02 používá společnou sémantiku intervalů, překryvu, stavů a aktivity křečka definovanou v BR-01, BR-02, BR-05 a BR-07. Operace je pouze čtecí a její výsledek nic nerezervuje.

**Předpoklad / neznámá / TBD:**

Není zatím rozhodnuto, zda má uživatelské rozhraní u výsledku `UNAVAILABLE` zveřejnit pouze stav, nebo také volné alternativní intervaly. Baseline vyžaduje pouze výsledek dostupnosti.

## OP-03 — Confirm Reservation — Potvrdit rezervaci

**Cíl / hodnota pro uživatele:**

Platný návrh rezervace se stane závaznou alokací křečka pro studenta.

**Spouštěcí událost:**

Přihlášený student požádá o potvrzení své rezervace podle jejího identifikátoru.

**Pozorovatelné požadavky:**

- **REQ-05:** Systém potvrdí vlastní rezervaci `DRAFT` pouze tehdy, když křeček existuje a je aktivní, při rozhodnutí platí `currentTime <= start - 15 min`, interval nekoliduje s jinou rezervací `CONFIRMED` stejného křečka a potvrzením nebude překročen denní limit stejné dvojice student–křeček.
- **REQ-06:** Při úspěchu systém změní tutéž rezervaci na `CONFIRMED`, vrátí její identifikátor a stav a předá oznámení Notification Service. Selhání předání oznámení změnu stavu nevrací zpět: systém zachová `CONFIRMED`, vrátí rozlišitelné varování, eviduje oznámení jako nedoručené a později jeho předání zopakuje. Při nesplnění podmínek potvrzení systém požadavek odmítne s rozlišitelným důvodem a rezervaci tímto požadavkem nezmění.
- **REQ-07:** Při souběžných potvrzeních musí zůstat zachován zákaz překryvu i denní limit; dva konfliktní návrhy nesmějí oba přejít do `CONFIRMED`.

**Předpoklady:**

- Rezervace existuje a patří přihlášenému studentovi.
- Rezervace je ve stavu `DRAFT`.
- Do začátku rezervace zbývá alespoň 15 minut (`currentTime <= start - 15 min`).
- Dostupnost, aktivita křečka, čas a denní limit se vyhodnocují znovu při rozhodnutí o potvrzení.

**Stav po úspěšném provedení:**

Rezervace je uložena jako `CONFIRMED`, blokuje interval daného křečka a její příslušné části se započítávají do denního limitu studenta pro tohoto křečka.

**Změna stavu:**

`DRAFT → CONFIRMED`

**Odkaz na doménová pravidla / invarianty:**

BR-01 — význam časového intervalu; BR-02 — zákaz překryvu potvrzených rezervací; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace; BR-06 — předání oznámení; BR-07 — aktivita křečka.

**Hlavní úspěšný scénář:**

1. Student odešle identifikátor vlastní rezervace `DRAFT`.
2. Systém ověří identitu, vlastnictví rezervace a její aktuální stav.
3. Systém znovu ověří čas (`currentTime <= start - 15 min`), aktivitu a dostupnost křečka a denní limit.
4. Systém jako jeden nedělitelný business výsledek změní stav rezervace na `CONFIRMED` tak, aby invarianty platily i při souběhu.
5. Systém předá oznámení Notification Service.
6. Systém vrátí identifikátor rezervace a stav `CONFIRMED`.

**Alternativní / chybové výsledky:**

- Neexistující rezervace nebo pokus jiného studenta → odmítnutí bez změny dat.
- Stav `CONFIRMED` nebo `CANCELLED` → odmítnutí kvůli nepřípustnému výchozímu stavu.
- Neaktivní nebo neexistující křeček → odmítnutí; rezervace zůstane `DRAFT`.
- Při `currentTime > start - 15 min` (do začátku zbývá méně než 15 minut nebo začátek již nastal) → odmítnutí; klientské rozhraní nabídne posun času o prodlevu; rezervace zůstane `DRAFT`.
- Od vytvoření návrhu vznikla kolize nebo byl vyčerpán denní limit → odmítnutí; rezervace zůstane `DRAFT`.
- Při souběhu konfliktních potvrzení může uspět nejvýše jedno; ostatní zůstanou `DRAFT`.
- Notification Service oznámení nepřijme → rezervace zůstane `CONFIRMED`, odpověď obsahuje varování a oznámení zůstane evidované pro pozdější opakování.

**Příklady ověření:**

- **V-11:** Vlastní platný `DRAFT`, aktivní Ferda, čas s předstihem alespoň 15 min (`currentTime <= start - 15 min`), žádná kolize a dostatečný limit → stejná rezervace přejde do `CONFIRMED`, začne blokovat čas a vznikne požadavek na oznámení.
- **V-12:** Po vytvoření návrhu jiný student potvrdil překrývající se rezervaci Ferdy → Confirm je odmítnut a návrh zůstane `DRAFT`.
- **V-13:** Student má u Ferdy v daném dni potvrzených 20 minut a potvrzuje další nekolidující návrh na 11 minut → odmítnutí kvůli limitu, stav zůstane `DRAFT`.
- **V-14:** Dva studenti současně potvrzují překrývající se návrhy stejného křečka → nejvýše jeden skončí jako `CONFIRMED`.
- **V-15:** Pokus potvrdit `CANCELLED` nebo již `CONFIRMED` rezervaci → odmítnutí bez změny stavu a bez nového oznámení.
- **V-15A:** Pokus potvrdit `DRAFT` méně než 15 minut před začátkem (`currentTime > start - 15 min`) nebo v čase začátku → odmítnutí a stav zůstane `DRAFT`.
- **V-15B:** Rezervace splní podmínky potvrzení, ale Notification Service oznámení nepřijme → rezervace zůstane `CONFIRMED`, odpověď obsahuje varování a oznámení je evidováno pro pozdější opakování.

**Zdůvodnění / zdroj:**

Operace vychází z přechodu `DRAFT → CONFIRMED` v Project Frame. Právě Confirm vytváří závaznou alokaci; proto musí znovu ověřit pravidla a zachovat je i při souběhu.

**Přijatá sémantika Confirm:**

Confirm je v baseline v0.1 jedinou operací, která vytváří závaznou alokaci. Při jednom rozhodnutí aplikuje BR-01, BR-02, BR-04, BR-05 a BR-07; po změně stavu použije politiku oznámení BR-06. Konkrétní technický mechanismus pro zachování invariantů při souběhu bude rozhodnut v C03.

**Předpoklad / neznámá / TBD:**

Interval opakování a maximální počet pokusů o doručení oznámení zatím nejsou určeny. Tato provozní nejistota nemění přijaté chování rezervace: úspěšně potvrzený stav se při selhání Notification Service nevrací zpět.

## OP-04 — Cancel Reservation — Zrušit rezervaci

**Cíl / hodnota pro uživatele:**

Student odvolá vlastní návrh nebo potvrzenou rezervaci a u potvrzené rezervace uvolní čas křečka pro ostatní.

**Spouštěcí událost:**

Přihlášený student požádá o zrušení své rezervace podle jejího identifikátoru.

**Pozorovatelné požadavky:**

- **REQ-08:** Systém změní vlastní rezervaci ve stavu `DRAFT` nebo `CONFIRMED` na `CANCELLED`, pokud požadavek rozhodne nejpozději 15 minut před časem jejího začátku (`currentTime <= start - 15 min`). Záznam ani jeho identifikátor nesmaže, vrátí identifikátor a nový stav a předá oznámení Notification Service. Selhání předání oznámení změnu stavu nevrací zpět: systém zachová `CANCELLED`, vrátí rozlišitelné varování, eviduje oznámení jako nedoručené a později jeho předání zopakuje.
- **REQ-09:** Neexistující nebo cizí rezervace vede k odmítnutí s rozlišitelným důvodem a bez změny rezervace. Nové zrušení rezervace `DRAFT` nebo `CONFIRMED` podané méně než 15 minut před začátkem nebo po něm (`currentTime > start - 15 min`) je odmítnuto. Opakované zrušení vlastní rezervace `CANCELLED` je idempotentní úspěch bez další změny a bez dalšího oznámení bez ohledu na aktuální čas.

**Předpoklady:**

- Rezervace existuje a patří přihlášenému studentovi.
- Pro nový přechod do `CANCELLED` je rezervace ve stavu `DRAFT` nebo `CONFIRMED`.
- Do začátku rezervace zbývá alespoň 15 minut (`currentTime <= start - 15 min`).

**Stav po úspěšném provedení:**

Rezervace zůstává uložená pod stejným ID ve stavu `CANCELLED`. Neblokuje dostupnost křečka a nezapočítává se do denního limitu.

**Změna stavu:**

`DRAFT → CANCELLED` nebo `CONFIRMED → CANCELLED`; opakované zrušení již `CANCELLED` rezervace je idempotentní odpověď bez stavového přechodu.

**Odkaz na doménová pravidla / invarianty:**

BR-03 — politika rušení; BR-04 — denní limit student–křeček; BR-05 — význam stavů rezervace; BR-06 — předání oznámení; BR-07 — aktivita křečka.

**Hlavní úspěšný scénář:**

1. Student odešle identifikátor vlastní rezervace.
2. Systém ověří identitu, vlastnictví, aktuální stav a časovou podmínku rušení (`currentTime <= start - 15 min`).
3. Systém změní stav rezervace na `CANCELLED` a zachová její ostatní údaje.
4. Systém předá oznámení Notification Service.
5. Systém vrátí identifikátor rezervace a stav `CANCELLED`.

**Alternativní / chybové výsledky:**

- Neexistující rezervace nebo pokus jiného studenta → odmítnutí bez změny dat.
- Do začátku rezervace zbývá méně než 15 minut nebo začátek již nastal/uplynul (`currentTime > start - 15 min`) → odmítnutí a zachování původního stavu.
- Vlastní rezervace je již `CANCELLED` → úspěch se stejným ID a stavem bez nové změny a bez dalšího oznámení, i když do začátku zbývá méně než 15 minut nebo čas začátku již uplynul.
- Neaktivita křečka zrušení neblokuje.
- Pokud Cancel a Confirm stejného návrhu probíhají souběžně před začátkem, oba výsledky musejí odpovídat jednomu pořadí změn. Cancel může přejít z `DRAFT` i `CONFIRMED` do `CANCELLED`; konečný stav po úspěšném Cancel je vždy `CANCELLED`.
- Notification Service oznámení nepřijme → rezervace zůstane `CANCELLED`, odpověď obsahuje varování a oznámení zůstane evidované pro pozdější opakování.

**Příklady ověření:**

- **V-16:** Vlastní `DRAFT` podaný nejpozději 15 minut před začátkem (`currentTime <= start - 15 min`) → stejná rezervace přejde do `CANCELLED` a vznikne jeden požadavek na oznámení.
- **V-17:** Vlastní `CONFIRMED` podaný nejpozději 15 minut před začátkem → `CANCELLED`; interval přestane blokovat dostupnost a přestane čerpat denní limit.
- **V-18:** Vlastní `CONFIRMED` méně než 15 minut před začátkem nebo v čase začátku (`currentTime > start - 15 min`) → odmítnutí a zachování `CONFIRMED`.
- **V-19:** Opakované zrušení vlastní `CANCELLED` → úspěch se stavem `CANCELLED`, žádná další změna ani nové oznámení.
- **V-20:** Jiný student se pokusí rezervaci zrušit → odmítnutí bez změny stavu.
- **V-20A:** Zrušení přejde do `CANCELLED`, ale Notification Service oznámení nepřijme → rezervace zůstane `CANCELLED`, odpověď obsahuje varování a oznámení je evidováno pro pozdější opakování.
- **V-20B:** Confirm a Cancel stejného budoucího návrhu proběhnou souběžně → pokud se první rozhodne Cancel, Confirm je odmítnut; pokud se první rozhodne Confirm, následný Cancel přejde z `CONFIRMED` do `CANCELLED`. Po úspěšném Cancel je konečný stav vždy `CANCELLED`.

**Zdůvodnění / zdroj:**

Operace vychází z přechodů do `CANCELLED` v Project Frame. Uchování záznamu zachovává historii a jednoznačně odlišuje zrušenou rezervaci od neexistující. Hranice „nejpozději 15 minut před začátkem“ poskytuje ověřitelnou politiku rušení pro návrh baseline.

**Přijatá sémantika Cancel:**

OP-04 používá jednotnou politiku rušení, stavů, oznámení a aktivity křečka definovanou v BR-03 až BR-07. Její výsledek musí tato pravidla zachovat také při souběhu s Confirm.

**Předpoklad / neznámá / TBD:**

Interval opakování a maximální počet pokusů o doručení oznámení zatím nejsou určeny. Politika `currentTime <= start - 15 min`, idempotentní opakované zrušení a zachování stavu `CANCELLED` při selhání Notification Service byly přijaty při kontrole požadavků.

## 2. Společná doménová pravidla a invarianty

Tato část je jediným autoritativním místem pro pravidla platná napříč operacemi. Jednotlivé operace pravidla používají a odkazují na ně, ale nemění jejich význam.

### BR-01 — Význam časového intervalu

- Rezervační interval má tvar `[start, end)`: začátek do intervalu patří, konec nikoli.
- Interval je platný právě tehdy, když obsahuje dva jednoznačné časové okamžiky a platí `start < end`.
- Intervaly A a B se překrývají právě tehdy, když `A.start < B.end` a současně `B.start < A.end`. Pouhý dotyk hranic není překryv.
- Časové okamžiky se porovnávají jako absolutní okamžiky. `currentTime` je hodnota systémových hodin v okamžiku rozhodnutí operace; při automatickém ověření musí být tento čas ovladatelný.
- Samotná platnost intervalu nevyžaduje budoucí začátek. Create, Confirm i Cancel navíc vyžadují časovou podmínku nejpozději 15 minut před začátkem rezervace (`currentTime <= start - 15 min`) podle BR-03.

### BR-02 — Invariant exkluzivního křečka

- V žádném přijatém stavu systému nesmějí existovat dvě časově se překrývající rezervace `CONFIRMED` stejného křečka.
- Dostupnost křečka blokují pouze rezervace `CONFIRMED`. Stavy `DRAFT` a `CANCELLED` ji neblokují.
- Invariant musí zůstat zachován také při souběžných pokusech o potvrzení. Z konfliktních pokusů může uspět nejvýše jeden.
- Check Availability poskytuje pouze okamžitý pohled a křečka nedrží; Confirm proto kontroluje invariant znovu při změně stavu.

### BR-03 — Politika rušení a časových termínů

- Vlastní rezervaci `DRAFT` nebo `CONFIRMED` lze změnit na `CANCELLED` pouze při `currentTime <= start - 15 min`.
- Při `currentTime > start - 15 min` (do začátku zbývá méně než 15 minut nebo začátek nastal/uplynul) je nový přechod do `CANCELLED` odmítnut a původní stav zůstane zachován.
- Opakované zrušení vlastní rezervace `CANCELLED` je idempotentní úspěch bez změny a bez nového oznámení, a to bez ohledu na aktuální čas.
- Zrušená rezervace zůstává uložená pod stejným ID; fyzicky se nemaže.
- Souběh Confirm a Cancel stejného návrhu musí odpovídat jednomu pořadí změn. Po úspěšném Cancel je konečný stav `CANCELLED`.

### BR-04 — Denní limit student–křeček

- Pro každou dvojici student–křeček smí součet částí jejích rezervací `CONFIRMED` připadajících na jeden kalendářní den činit nejvýše 30 minut.
- Kalendářní den se určuje v časovém pásmu `Europe/Prague`. Rezervace přes půlnoc se rozdělí a do každého dne se započítá pouze část, která do něj spadá.
- Rezervace `DRAFT` a `CANCELLED` limit nečerpají.
- Do kontroly při Confirm se započítává i potvrzovaný návrh. Při souběžných potvrzeních nesmí výsledný součet limit překročit.
- Create provádí pouze předběžnou kontrolu podle aktuálního stavu; závazná kontrola probíhá při Confirm.

### BR-05 — Význam stavů a povolené přechody

- `DRAFT` zaznamenává záměr studenta, nealokuje křečka a nečerpá denní limit.
- `CONFIRMED` je přijatá alokace, blokuje dostupnost křečka a čerpá denní limit podle BR-04.
- `CANCELLED` je koncový stav, neblokuje dostupnost a nečerpá denní limit.
- Povolené změny jsou `[neexistuje] → DRAFT`, `DRAFT → CONFIRMED`, `DRAFT → CANCELLED` a `CONFIRMED → CANCELLED`.
- Opakovaný Cancel nad `CANCELLED` vrací idempotentní úspěch, ale nejde o nový stavový přechod. Jiné přechody nejsou v baseline v0.1 povoleny.

### BR-06 — Oznámení o změně stavu

- Každý skutečný přechod do `CONFIRMED` nebo `CANCELLED` vytvoří právě jeden požadavek na oznámení uživateli.
- Idempotentní opakování operace bez změny stavu nevytvoří nové oznámení.
- Selhání Notification Service nevrací úspěšnou změnu rezervace zpět. Systém vrátí nový stav spolu s rozlišitelným varováním a eviduje oznámení jako nedoručené pro pozdější opakování.
- Pozdější úspěšné doručení nesmí vytvořit další změnu stavu rezervace. Interval opakování a maximální počet pokusů zůstávají provozní TBD pro další návrh.

### BR-07 — Aktivita křečka

- Křeček evidovaný jako aktivní může být použit pro Create a Confirm. Neaktivní křeček tyto operace blokuje.
- Check Availability vrací pro existujícího neaktivního křečka `UNAVAILABLE`. Neexistující křeček představuje chybný požadavek, nikoli výsledek nedostupnosti.
- Neaktivita křečka nebrání zrušení existující rezervace.

## 3. Kontrola přijetí požadavků

Kontrola byla provedena 22. 9. 2026 nad požadavky `REQ-01` až `REQ-09`. U každého požadavku byl posouzen význam a hranice pojmů, potřeba a zdůvodnění, pozorovatelný výsledek, proveditelnost, konkrétní způsob ověření, závislost na stavu a čase, vliv souběhu, konzistence s ostatními částmi a otevřené nejistoty. Níže uvedené výsledky tvoří záznam této kontroly; přesné definice sdílených pojmů jsou soustředěny do společných pravidel `BR-01` až `BR-07`.

### Přijatá společná rozhodnutí

- Stav `DRAFT` nealokuje křečka. Kontrola kolize a limitu při Create je pouze předběžná zpětná vazba; rozhodující kontrola proběhne při Confirm.
- Dostupnost blokují pouze rezervace `CONFIRMED`. Výsledek Check Availability je okamžitý pohled, nikoli příslib budoucího potvrzení.
- Rezervaci lze zrušit i potvrdit pouze nejpozději 15 minut před začátkem, tedy když `currentTime <= start - 15 min`. V okamžiku `currentTime > start - 15 min` už potvrzení ani nové zrušení možné není.
- Opakované zrušení vlastní rezervace `CANCELLED` je idempotentní úspěch bez další změny a bez nové notifikace.
- Selhání Notification Service nevrací úspěšnou změnu rezervace zpět. Uživatel dostane varování a nedoručené oznámení zůstane evidované pro pozdější opakování.

### Výsledek kontroly jednotlivých požadavků

| Požadavek | Význam, potřeba a pozorovatelný výsledek | Ověřitelnost, stav, čas a souběh | Konzistence a nejistota | Výsledek |
|---|---|---|---|---|
| `REQ-01` | Jednoznačně odděluje zaznamenání záměru od alokace křečka; úspěchem je právě jeden nový `DRAFT` s vráceným ID při dodržení termínu nejpozději 15 min předem. | Ověřují jej V-01, V-04 a V-05. Dva samostatné souběžné požadavky mohou vytvořit dva návrhy, protože `DRAFT` neblokuje. | Souhlasí s Confirm a CP1. Předběžná kontrola kolize a limitu není garancí potvrzení. | Přijat |
| `REQ-02` | Zajišťuje, že neplatný Create nezanechá částečný záznam a vrátí rozlišitelný důvod. | Ověřují jej V-02 a V-03; po odmítnutí musí počet rezervací zůstat stejný. | Důvody odmítnutí odpovídají předpokladům OP-01. Způsob autentizace zůstává explicitní neznámou. | Přijat |
| `REQ-03` | Jednoznačně definuje `AVAILABLE` a `UNAVAILABLE`; neaktivní křeček ani překryv s `CONFIRMED` nejsou dostupné. | Ověřují jej V-06 až V-09 včetně dotyku intervalů. Operace nemění stav a její výsledek může po souběžném Confirm zastarat. | Souhlasí s významem stavů v Create a Confirm. | Přijat |
| `REQ-04` | Odděluje chybný dotaz od platného výsledku nedostupnosti a zakazuje vedlejší změny. | Ověřuje jej V-10 a kontrola, že data zůstala beze změny. | Souhlasí s předpoklady OP-02. Zobrazení alternativních termínů není součástí baseline. | Přijat |
| `REQ-05` | Určuje jediný okamžik závazné alokace křečka a podmínky přechodu `DRAFT → CONFIRMED` (včetně lhůty nejpozději 15 min předem). | Ověřují jej V-11 až V-13, V-15 a V-15A. Rozhoduje stav a čas v okamžiku Confirm, nikoli při Create. | Souhlasí s Availability, denním limitem a životním cyklem rezervace. | Přijat |
| `REQ-06` | Definuje výsledek úspěšného potvrzení i pozorovatelné selhání notifikace bez ztráty potvrzené rezervace. | V-11 ověří stav a vznik oznámení; V-15B simuluje selhání Notification Service a ověří `CONFIRMED`, varování a evidované nedoručené oznámení. | Interval a počet opakování zůstávají TBD, ale nemění business výsledek operace. | Přijat |
| `REQ-07` | Chrání zákaz dvojí rezervace a denní limit při souběžných potvrzeních. | V-14 musí skutečně spustit konfliktní potvrzení souběžně; nejvýše jedno smí uspět. | Souhlasí s REQ-03 a REQ-05. Způsob technického zajištění je architektonický driver pro C03. | Přijat |
| `REQ-08` | Definuje zrušení bez fyzického smazání, přesnou časovou hranici (nejpozději 15 min předem) a chování při selhání notifikace. | Ověřují jej V-16 až V-18 a V-20A; při testu musí být zdroj času ovladatelný. | Souhlasí s dostupností a denním limitem. | Přijat |
| `REQ-09` | Chrání cizí a pozdě rušené rezervace a přijímá idempotentní opakované zrušení bez ohledu na čas. | Ověřují jej V-18 až V-20 a V-20B. Souběh Cancel a Confirm musí odpovídat jednomu pozorovatelnému pořadí změn. | Souhlasí s přijatou politikou rušení; žádná otevřená business nejistota. | Přijat |

Všechny požadavky `REQ-01` až `REQ-09` prošly kontrolou přijetí a odkazovaná společná pravidla jsou definována. Specifikace Baseline v0.1 je plně konzistentní se systémovými diagramy.

---

# 4. Specification Baseline v0.2 — Změna: Schvalovací proces (Část B)

## 4.1 Změnová karta a analýza dopadu změny C02

**Kontext změny:**
Někteří křečci (speciální/vzácní nebo vyžadující dohled) vyžadují schválení oprávněnou osobou (**Správce křečka**) dříve, než se rezervace může stát závaznou (`CONFIRMED`). Schválení může být opožděno, zamítnuto nebo může vypršet bez odezvy.

### Analýza dopadu podle oblastí

| Oblast | Posouzení dopadu |
|---|---|
| **Create (OP-01)** | **Nemění se.** Vytváří stále nezávazný návrh `DRAFT`. |
| **Availability (OP-02)** | **Rozšiřuje se.** Rezervace ve stavu `PENDING_APPROVAL` dočasně blokuje křečka před ostatními studenty, aby nevznikla kolize během čekání na vyjádření správce. |
| **Confirm (OP-03)** | **Větví se.** Pro běžného křečka přechází rovnou `DRAFT → CONFIRMED`. Pro křečka vyžadujícího schválení operace provede přechod `DRAFT → PENDING_APPROVAL`. |
| **Approve / Reject (OP-05)** | **Vzniká nová operace.** Správce křečka rozhoduje o schválení (`CONFIRMED`) nebo zamítnutí (`REJECTED`). |
| **Cancel (OP-04)** | **Rozšiřuje se.** Student může stornovat i žádost ve stavu `PENDING_APPROVAL` (nejpozději 15 minut před začátkem rezervace). |
| **Stavový diagram** | **Rozšiřuje se.** Přibývají stavy `PENDING_APPROVAL`, `REJECTED` a `EXPIRED`. |
| **Diagram případů užití** | **Rozšiřuje se.** Přibývá primární aktér **Správce křečka**, systémový aktér **Systémový časovač** a operace OP-05 a OP-06. |
| **Ověření** | Přibývají scénáře pro schválení, zamítnutí, expiraci časovačem a storno čekající žádosti. |
| **Architektura pro C03** | Vzniká potřeba asynchronního workflow, plánovače úloh (časovač pro expiraci) a notifikace správce. |

---

## 4.2 Dopad změny C02 (Souhrn)

- **Změněná podmínka:** Rezervace křečka vyžadujícího schválení nemůže přejít přímo do `CONFIRMED`, ale vyžaduje mezistav `PENDING_APPROVAL` a rozhodnutí správce křečka.
- **Dotčené požadavky:** `REQ-03` (rozšíření blokování na stav `PENDING_APPROVAL`), `REQ-05` (větvení potvrzení na přímé vs. žádost o schválení), `REQ-08` / `REQ-09` (možnost stornovat i stav `PENDING_APPROVAL`).
- **Nedotčené požadavky + proč:** `REQ-01` a `REQ-02` (Create stále vytváří pouze `DRAFT`), `BR-01` (sémantika intervalů), `BR-04` (denní limit 30 minut student–křeček), `BR-06` (transakční notifikace a outbox vzor se nemění).
- **Nový aktér / operace:** Aktér **Správce křečka**, systémový aktér **Systémový časovač**, operace **OP-05: Rozhodnout o rezervaci** a **OP-06: Expirace žádostí**.
- **Změněná pravidla a význam stavů:**
  - `PENDING_APPROVAL`: Dočasná alokace – chrání termín před kolizí a dočasně čerpá studentův denní limit.
  - `REJECTED`: Koncový stav zamítnutí – uvolňuje alokaci i limit.
  - `EXPIRED`: Koncový stav při nečinnosti správce (1 hodinu před začátkem) – uvolňuje alokaci i limit.
- **Změna diagramů:** Zpracována a visualizována v [DIAGRAMS.md](file:///C:/Users/tomki/Desktop/SWI_2027/DIAGRAMS.md#L254-L330) (oddíl 2.1 a 2.2).
- **Architektonické drivery pro C03:**
  1. *Asynchronní schvalovací proces:* Oddělení zadání žádosti od autorizačního rozhodnutí v čase.
  2. *Automatický plánovač / časovač (Scheduler):* Hlídání a automatické odbavování expirací bez lidského zásahu.

---

## 4.3 OP-05 — Approve / Reject Reservation — Rozhodnout o rezervaci

**Cíl / hodnota pro uživatele:**  
Správce křečka posoudí čekající žádost studenta a autoritativně rozhodne o jejím schválení nebo zamítnutí.

**Spouštěcí událost:**  
Oprávněný Správce křečka odešle rozhodnutí (`APPROVE` nebo `REJECT`) k existující rezervaci ve stavu `PENDING_APPROVAL`.

**Pozorovatelné požadavky:**  
- **REQ-10 (Schválení):** Pokud je rezervace ve stavu `PENDING_APPROVAL`, křeček je aktivní, platí `currentTime <= start - 15 min` a rozhodnutí je `APPROVE`, systém převede rezervaci do stavu `CONFIRMED`, zachová alokaci i započtení denního limitu a odešle oznámení studentovi.
- **REQ-11 (Zamítnutí):** Pokud je rozhodnutí `REJECT`, systém převede rezervaci do stavu `REJECTED`, uvolní blokování křečka i denní limit studenta a odešle oznámení studentovi.
- **REQ-12 (Neoprávněné / Neplatné rozhodnutí):** Pokus neoprávněné osoby nebo pokus rozhodnout rezervaci v jiném stavu než `PENDING_APPROVAL` systém odmítne bez změny dat.

**Předpoklady:**  
- Uživatel je autentizován v roli Správce křečka.
- Rezervace existuje a je ve stavu `PENDING_APPROVAL`.
- Čas rozhodnutí splňuje lhůtu před začátkem rezervace (`currentTime < start`).

**Stav po úspěšném provedení:**  
- Při schválení: Rezervace je `CONFIRMED`, křeček zůstává závazně alokován a denní limit zůstává vyčerpán.
- Při zamítnutí: Rezervace je `REJECTED`, křeček je volný pro ostatní a studentovi je uvolněn denní limit.

**Změna stavu:**  
`PENDING_APPROVAL → CONFIRMED` nebo `PENDING_APPROVAL → REJECTED`

**Příklady ověření:**  
- **V-21:** Správce schválí platnou žádost `PENDING_APPROVAL` → přechod do `CONFIRMED`, student obdrží oznámení o schválení.
- **V-22:** Správce zamítne platnou žádost `PENDING_APPROVAL` → přechod do `REJECTED`, termín je okamžitě dostupný v `Check Availability` a studentovi se uvolní limit.
- **V-23:** Student se pokusí zavolat OP-05 na vlastní žádost → odmítnuto z důvodu neoprávněného přístupu.
- **V-24:** Pokus schválit rezervaci, která je již `CANCELLED`, `EXPIRED` nebo `CONFIRMED` → odmítnuto bez změny stavu.

---

## 4.4 OP-06 — Expire Reservations — Expirace žádostí o schválení

**Cíl / hodnota pro uživatele:**  
Zabránit zablokování křečka a studentova denního limitu v případě, že správce křečka na žádost včas nezareaguje.

**Spouštěcí událost:**  
Systémový plánovač (časovač) periodicky kontroluje nerozhodnuté žádosti.

**Pozorovatelné požadavky:**  
- **REQ-13:** Pokud je rezervace ve stavu `PENDING_APPROVAL` a do jejího začátku zbývá méně než 1 hodina (`currentTime >= start - 1h`), systém rezervaci automaticky převede do stavu `EXPIRED`.
- **REQ-14:** Přechod do stavu `EXPIRED` okamžitě uvolní alokaci křečka i studentův denní limit a vygeneruje oznámení pro studenta i správce křečka.

**Příklady ověření:**  
- **V-25:** Žádost `PENDING_APPROVAL` v čase `start - 59 minut` bez rozhodnutí správce → časovač ji změní na `EXPIRED`, křeček je volný pro ostatní.
- **V-26:** Žádost `PENDING_APPROVAL` v čase `start - 2 hodiny` → časovač ji ponechá ve stavu `PENDING_APPROVAL`.
