# 📊 Křečkomat — Aktuální analýza stavu projektu a revize dokumentace

> **Datum analýzy:** 16. listopadu 2026  
> **Projekt:** Křečkomat — rezervační systém školních antistresových křečků  
> **Předmět:** Softwarové inženýrství (SWI) — FEI VŠB-TUO  
> **Tým:** Křečkomat (Martin Kalus, Tomáš Kirnig, Petr Gála, Dennis Carnevale)  
> **Výchozí větev:** `main` (commit `169115d` a navazující)

---

## 📑 Obsah

1. [Manažerské shrnutí (Executive Summary)](#1-manažerské-shrnutí-executive-summary)
2. [Aktuální stav testů a verifikace na větvi `main`](#2-aktuální-stav-testů-a-verifikace-na-větvi-main)
3. [Audit plnění jednotlivých zadání (C01 – C10)](#3-audit-plnění-jednotlivých-zadání-c01--c10)
4. [Hloubkový rozbor: Proč dokumentace není v ideálním stavu?](#4-hloubkový-rozbor-proč-dokumentace-není-v-ideálním-stavu)
5. [Technický rozbor neopravených vad (C06 Findings F1 a F2)](#5-technický-rozbor-neopravených-vad-c06-findings-f1-a-f2)
6. [Konkrétní akční plán pro zbytek semestru (Roadmapa)](#6-konkrétní-akční-plán-pro-zbytek-semestru-roadmapa)

---

## 1. Manažerské shrnutí (Executive Summary)

* **Dosažený milník:** Projekt má úspěšně za sebou milník **CP1 (C07 Project Status Report & Technical Design Review)**. Prezentace před vyučujícím proběhla úspěšně.
* **Technické jádro:** Kódové jádro aplikace je plně funkční a stabilní. Všechny existující testovací sady prochází se 100% úspěšností (10 unit testů, 4 architektonické testy, 30 integračních testů a 7 regresních testů).
* **Zpětná vazba od vyučujícího:** Jediným negativním bodem hodnocení bylo, že **„dokumentace není v ideálním stavu“**.
* **Hlavní příčiny stavu dokumentace:**
  1. **Zcela chybějící Risk Assessment (C07 Část B):** Zadání C07 výslovně nařizovalo vložit do `docs/evidence-and-evolution.md` tabulku minimálně 4 rizik ve 3 kategoriích s hodnocením pravděpodobnosti a dopadu (L/I), mitigation plánem a reziduálním rizikem. V repozitáři tato sekce **zcela chybí**.
  2. **Dvojkolejnost a duplicita dokumentace:** V kořeni repozitáře byl vytvořen soubor `Dokumentace.md` (300 řádků), který porušuje pravidlo předmětu *„nevyrábějte další izolovanou dokumentaci / bez dalšího reportu“*. Duplikuje data ze složky `docs/`, končí u cvičení C05 a nereflektuje C06, C07 ani další vývoj.
  3. **Nerealizované opravy vad z peer review (C06):** Nálezy F1 (race condition v čase předstihu) a F2 (chybné počítání denního limitu v UI) tým v C06 formálně přijal (`ACCEPTED — change required`), ale v kódu dosud **nebyly opraveny**, ačkoliv dokumentace tvrdí, že pravidla fungují bezchybně.
  4. **Absence Git tagů:** V repozitáři dosud nebyl vytvořen žádný Git tag pro formální ukotvení milníků (*assessed baseline*, *reporting baseline*).

---

## 2. Aktuální stav testů a verifikace na větvi `main`

Při spuštění všech verifikačních sad na větvi `main` je systém v perfektní kondici:

| Testovací sada | Příkaz | Počet scénářů | Výsledek | Význam |
|---|---|:---:|:---:|---|
| **Unit testy Detailed Designu (C05)** | `npm run test:unit` | 10 | **10 PASS / 0 FAIL** | Izolované in-memory testy kontraktu `IConfirmationPolicy` a doménových invariantů |
| **Architektonické testy vrstev (C03)** | `npm run test:arch` | 4 | **4 PASS / 0 FAIL** | Statická kontrola L2 (Controller &rarr; Service &rarr; Repository &rarr; Domain) |
| **Integrační Specification Baseline (C02)** | `npm run verify` (část 1) | 30 | **30 PASS / 0 FAIL** | Ověření všech 30 integračních scénářů operací OP-01..OP-06 proti PostgreSQL |
| **Regresní testy souběhu a outboxu** | `npm run verify:regression` | 7 | **7 PASS / 0 FAIL** | Ověření scénářů souběhu (R-01..R-07), outbox transakcí a limitů |
| **TypeScript kompilace** | `npm run build` | — | **0 chyb (OK)** | Striktní typová kontrola `tsc` do adresáře `dist/` |

---

## 3. Audit plnění jednotlivých zadání (C01 – C10)

Detailní posouzení všech zadání z adresáře `zadani/` vůči stavu repozitáře:

### ✅ C01 — Inception, Walking Skeleton & Spike
* **Zadání:** [zadani/zadani_1.txt](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/zadani_1.txt)
* **Požadavek:** Založení týmu, repozitáře, definice domény křečků, Project Frame, technologický spike s databází, walking skeleton.
* **Stav:** **HOTOVO (100 %)**.
* **Evidence:** [docs/intent-and-change.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/intent-and-change.md), [src/spike.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/spike.ts), [README.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/README.md).

### ✅ C02 — Engineering Specification & Baseline v0.1/v0.2
* **Zadání:** [zadani/zadani_2.txt](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/zadani_2.txt)
* **Požadavek:** Specifikace čtyř základních operací (`OP-01` Create, `OP-02` Availability, `OP-03` Confirm, `OP-04` Cancel), doménová pravidla `BR-01` až `BR-04`, změna v0.2 se schvalováním (`OP-05` Decide, `OP-06` Expire, `BR-05`..`BR-07`), 30 integračních testů.
* **Stav:** **HOTOVO (100 %)**.
* **Evidence:** [docs/reservation-specification.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/reservation-specification.md), diagramy v [DIAGRAMS.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/DIAGRAMS.md), integrační testy v [src/verify.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/verify.ts) (30 PASS).

### ✅ C03 — Software Architecture & ADR-01
* **Zadání:** [zadani/zadani_3.txt](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/zadani_3.txt), [zadani/SWI_C03_students_bilingual_v10.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/SWI_C03_students_bilingual_v10.html)
* **Požadavek:** AS-IS mapování scénáře Confirm na kód, 4 architektonické drivery, doménový model, odpovědnosti, ADR-01 (in-process modul expirací vs. externí worker), C4 model, sekvenční diagramy, oddělení vrstvy repozitáře a architektonické testy.
* **Stav:** **HOTOVO (100 %)**.
* **Evidence:** [docs/architecture-and-decisions.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/architecture-and-decisions.md), [src/repository.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/repository.ts), [src/service.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/service.ts), [src/arch.test.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/arch.test.ts).

### ➖ C04 — Quality Criteria
* **Požadavek:** Původně zamýšlené samostatné měření kvality.
* **Stav:** **N/A**. V peer review C06 i v interním hodnocení potvrzeno, že samostatné zadání C04 nebylo vyučujícím zadáno a povinnosti byly integrovány v rámci C03 a C05.

### ✅ C05 — Detailed Design & Unit Testing
* **Zadání:** [zadani/SWI_C05_Detailed_Design_students_toggle_v4.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/SWI_C05_Detailed_Design_students_toggle_v4.html)
* **Požadavek:** Detailní návrh vybrané jednotky (`Reservation Confirmation & Availability Policy`), kontrakt rozhraní `IConfirmationPolicy`, rozhodovací strom, 10 odvozených unit testů, obhajoba volby testovacích úrovní.
* **Stav:** **HOTOVO (100 %)**.
* **Evidence:** [docs/architecture-and-decisions.md#c05-detailed-design](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/architecture-and-decisions.md#c05-detailed-design), [src/domain.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/domain.ts), [src/domain.test.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/domain.test.ts) (10 PASS), evidence v [docs/evidence-and-evolution.md#c05-dd-verification-evidence](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/evidence-and-evolution.md#c05-dd-verification-evidence).

### ⚠️ C06 — Peer Review & Evidence Assessment
* **Podklad:** [Hodnoceni_C06_Kreckomat v5.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/Hodnoceni_C06_Kreckomat%20v5.md)
* **Požadavek:** Nezávislý audit týmem Deadlock. Zjištěny 2 ověřené vady:
  * **F1:** `confirmReservation()` odečítá referenční čas *před* čekáním na databázový zámek (stale time).
  * **F2:** Frontend v `public/index.html` chybně počítá denní limit (ignoruje pending stavy, UTC zóna, nerozděluje půlnoc).
  * Povinnost týmu: provést interní owner review a zapsat oficiální stanovisko (*Owner disposition*).
* **Stav:** **ČÁSTEČNĚ HOTOVO**. Stanovisko je na `main` zapsáno (ACCEPT pro F1 i F2), ale vady v kódu dosud **nebyly opraveny**.

### ⚠️ C07 — Project Status Report & Risk Assessment (Milník CP1)
* **Zadání:** [zadani/SWI_C07_C08_Assignment_CZ_EN_FINAL.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/SWI_C07_C08_Assignment_CZ_EN_FINAL.html)
* **Požadavek:**
  1. *Část A (TDR):* Technická obhajoba architektury a Detailed Designu.
  2. *Část B (Risk Assessment):* Minimálně 4 konkrétní rizika ve 3 kategoriích s plným mitigation plánem v `docs/evidence-and-evolution.md`.
  3. *Část C (Status Report):* 6 slidů prezentace projektu (CP1).
* **Stav:** **ČÁSTEČNĚ HOTOVO**. Prezentace proběhla úspěšně. **Část B (Risk Assessment) v dokumentaci zcela chybí**, což přímo vyvolalo negativní feedback.

### ❌ C08 — Controlled Change (Řízená změna)
* **Zadání:** [zadani/C08_FINAL.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/C08_FINAL.html)
* **Požadavek:** Formulace Change Requestu (`CR-xx`), akceptační podmínky, testovací reprodukce na výchozí baseline, Impact Analysis Matrix, Alternative Analysis a **ADR-02**, 2 krokované testovací scénáře.
* **Stav:** **CHYBÍ (0 %)**. Dosud nezačato.

### ❌ C09 — Implementace změny, integrace, CI a release
* **Zadání:** [zadani/C09_ZADANI_CZ_EN_PODROBNE.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/C09_ZADANI_CZ_EN_PODROBNE.html)
* **Požadavek:** Implementace změny z C08, integrační test přes reálnou hranici, CI pipeline (GitHub Actions / skript), release tag a reprodukovatelný checkout.
* **Stav:** **CHYBÍ (0 %)**. Dosud nezačato (navazuje na C08).

### ❌ C10 — Provozní situace a logy (Operations & Logs)
* **Zadání:** [zadani/C10_Student_Assignment_CZ_EN.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/zadani/C10_Student_Assignment_CZ_EN.html)
* **Požadavek:** Lokální ověření 4 provozních situací (běžný úspěch, kolizní odmítnutí, výpadek DB spojení, restart a obnova), posouzení logování (bez PII, diagnostika vs. šum), zpráva v evidenci.
* **Stav:** **CHYBÍ (0 %)**. Dosud nezačato.

---

## 4. Hloubkový rozbor: Proč dokumentace není v ideálním stavu?

Zde je konkrétní rozbor čtyř klíčových příčin negativního feedbacku od vyučujícího:

### 1. Zcela chybějící Risk Assessment (C07 Část B)
V zadání cvičení C07 je v tabulce *Definition of Done / required outcomes* doslova předepsáno:
> *„Before next C08: B: at least four risks in at least three categories; full treatment, residual and monitoring in docs/evidence-and-evolution.md“*

V souboru [docs/evidence-and-evolution.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/evidence-and-evolution.md) však po sekci C06 následují pouze záznamy o předešlých testech. **Analýza rizik tam zcela chybí.** Vyučující při kontrole repozitáře po prezentaci otevřel tento soubor a zjistil, že povinný výstup cvičení nebyl odevzdán.

### 2. Dvojkolejnost a izolovaný soubor `Dokumentace.md`
Při commitu `2869328` byl do kořene repozitáře přidán soubor [Dokumentace.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/Dokumentace.md).
* **Metodická chyba:** Zadání předmětu v C01, C07 i C08 výslovně varuje: *„Nezačínejte nový projekt a nevyrábějte další izolovanou dokumentaci. Každé tvrzení o dokončení, návrhu nebo ověření musí mít odkaz na konkrétní verzi... Šablony patří do existujícího repozitáře (bez dalšího reportu).“*
* **Důsledek:** Vznikly dva různé zdroje pravdy. Vyučující vyžaduje živou dokumentaci v adresáři `docs/` (`intent-and-change.md`, `architecture-and-decisions.md`, `evidence-and-evolution.md`, `reservation-specification.md`). Soubor `Dokumentace.md` působí jako statický marketingový leták, který končí u cvičení C05 a nereflektuje C06, C07 ani žádné nalezené vady či rizika.

### 3. Rozpor mezi deklarovaným a skutečným chováním kódu
V [README.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/README.md) i v [Dokumentace.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/Dokumentace.md) tým tvrdí:
> *„Denní limit: [████████████░░░░░░░░░░] 20 / 30 min ... Živá kontrola dostupnosti a vizuální ukazatel čerpání denního limitu (max. 30 minut denně) striktně rozpadlý přes půlnoc v Europe/Prague.“*

Tým Deadlock v peer review C06 exaktně prokázal, že to na webovém rozhraní není pravda (nález F2). Tým sice nález uznal jako `ACCEPTED`, ale kód neopravil a v dokumentaci rozpor nevysvětlil jako známé omezení či otevřený issue.

### 4. Absence Git tagů a identifikace baseline
V zadání C07 i C08 je opakovaně vyžadováno:
* Identifikovat výchozí baseline commit/tag.
* Odlišovat starou *assessed baseline* (commit `996e9be`) od nové *reporting baseline* (commit `98a8a9a` / `169115d`).
V repozitáři však dosud nebyl vytvořen ani jeden Git tag (`git tag -l` je prázdný).

---

## 5. Technický rozbor neopravených vad (C06 Findings F1 a F2)

### Nález F1 — Zastaralý čas při potvrzení (Race Condition)
* **Kde:** [src/service.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/service.ts#L246-L275)
* **Příčina:** Funkce `confirmReservation(reservationId, userId, now = new Date())` přijímá referenční čas `now` z HTTP kontroleru ještě předtím, než transakce získá řádkový zámek v PostgreSQL (`findReservationByIdForUpdate`).
* **Důsledek:** Pokud je systém pod zátěží a transakce čeká na zámek, po probuzení provede kontrolu předstihu 15 minut (`currentTime <= start - 15 min`) se starým časem. Může tak potvrdit rezervaci, která je v reálném čase již po limitu.
* **Plánovaná oprava:** Přebírat funkci/provider času a referenční čas odečíst až *po* získání všech potřebných řádkových zámků.

### Nález F2 — Chybný výpočet denního limitu v klientském UI
* **Kde:** [public/index.html](file:///home/tomas/school/VSCode/SWI/SWI_2027/public/index.html#L2124-L2135)
* **Příčina:** Funkce `calculateUsedMinutesForDay()`:
  1. Filtruje pouze `r.status === 'CONFIRMED'` &rarr; ignoruje žádosti čekající na schválení (`PENDING_APPROVAL`), ačkoliv ty dle `BR-04` limit čerpají.
  2. Parsování dne dělá přes `r.start_time.split('T')[0]` &rarr; používá UTC datum místo časového pásma `Europe/Prague`.
  3. Celou délku rezervace započítává do dne začátku &rarr; nerozděluje minuty u rezervací procházejících přes půlnoc.
* **Plánovaná oprava:** Sjednotit výpočet s doménovou logikou v [src/domain.ts](file:///home/tomas/school/VSCode/SWI/SWI_2027/src/domain.ts#L182-L200) (`calculateMinutesPerDay`).

---

## 6. Konkrétní akční plán pro zbytek semestru (Roadmapa)

Níže je doporučený postup rozdělený do tří logických kroků:

### 🟢 Krok 1: Okamžitá náprava dokumentace (Vyřešení feedbacku C07)
1. **Doplnit Risk Assessment do [docs/evidence-and-evolution.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/evidence-and-evolution.md):**
   Vložit sekci `## C07 Risk Assessment` s tabulkou minimálně 4 rizik:
   * **RSK-01 (Technical / Concurrency):** Zastaralý čas před zámkem (F1) &rarr; riziko potvrzení rezervace po limitu.
   * **RSK-02 (Integration / Data):** Rozdíl ve výpočtu denního limitu na frontendu oproti serveru (F2) &rarr; zmatení uživatele při zamítnutí serverem.
   * **RSK-03 (External / Infrastructure):** Závislost na cloudové PostgreSQL databázi (Supabase SSL) &rarr; riziko latence nebo výpadku spojení.
   * **RSK-04 (Architecture / Availability):** Periodická expirace in-process plánovačem (ADR-01) &rarr; zpoždění uvolnění slotů při výpadku/restartu procesu.
   *(U každého uvést příčina &rarr; událost &rarr; následek, L/I matici, mitigation strategii, vlastníka a reziduální riziko).*
2. **Ukončit dvojkolejnost dokumentace:**
   Odstranit soubor [Dokumentace.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/Dokumentace.md) z kořene repozitáře (jeho užitečné souhrnné části integrovat do [README.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/README.md) a do složky [docs/](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs)).
3. **Vytvořit Git tagy:**
   * `git tag c06-assessed 996e9be`
   * `git tag c07-reporting 169115d`

### 🟡 Krok 2: Zpracování C08 (Controlled Change)
* **Ideální téma změny:** Zvolit opravu vady **F1** (přesunutí odečtu času až po získání DB zámku) jako oficiální **Change Request (CR-08)**:
  * *Krok 0:* Označení výchozího stavu (`c07-reporting`).
  * *Krok 1:* Formulace CR a akceptačních kritérií (`AC-01: čas předstihu se ověřuje po locku`).
  * *Krok 2:* Reprodukční test selhání na výchozí baseline.
  * *Krok 3:* Impact Analysis Matrix (změny v `service.ts`, `domain.ts`, `repository.ts`).
  * *Krok 4:* Analýza alternativ řešení a **ADR-02**.
  * *Krok 5:* Dva krokované testovací scénáře (jeden s reálnou DB).

### 🔵 Krok 3: Dokončení C09 a C10
* **C09:**
  * Implementovat schválenou změnu z C08 do kódu.
  * Vytvořit CI workflow (např. `.github/workflows/ci.yml`) spouštějící `npm run build && npm test && npm run verify`.
  * Vydat Git release tag `v1.0.0-c09`.
* **C10:**
  * Provést 4 lokální provozní situace (úspěšná rezervace, odmítnutí kolize, nasimulovaný pád DB spojení, restart aplikace).
  * Doplnit závěrečnou zprávu o efektivitě a bezpečnosti logování do [docs/evidence-and-evolution.md](file:///home/tomas/school/VSCode/SWI/SWI_2027/docs/evidence-and-evolution.md).
