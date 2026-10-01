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
- zamítnutí a automatickou expiraci,
- selhání doručení Notification Service bez vrácení úspěšné změny stavu.

Byly spuštěny všechny scénáře `V-01` až `V-26`, včetně doplňkových scénářů `V-15A`, `V-15B`, `V-20A` a `V-20B`.

Výsledek skutečného běhu:

```text
PASS: 30
FAIL: 0
CELKEM: 30
```

Všechny definované ověřovací scénáře prošly úspěšně.

**Nalezené nesoulady a způsob vyřešení:**  
- Operace Create, Confirm a Cancel používají časovou hranici
  `currentTime <= start - 15 min`.
- Pro schvalovací proces Baseline v0.2 byla zavedena samostatná
  hranice: Správce křečka může rozhodnout pouze při
  `currentTime < start - 1h`.
- Od okamžiku `currentTime >= start - 1h` je nerozhodnutá rezervace
  `PENDING_APPROVAL` určena k automatické expiraci.
- Stav `PENDING_APPROVAL` v Baseline v0.2 blokuje dostupnost křečka
  a dočasně čerpá denní limit.
- Stavy `REJECTED` a `EXPIRED` jsou koncové a uvolňují dostupnost
  křečka i studentův denní limit.

**Ověření spolehlivosti oznámení:**  
Pro scénáře `V-15B` a `V-20A` je doručení Notification Service
v automatizovaném ověření ovladatelné tak, aby bylo možné
deterministicky simulovat jeho selhání.

Při selhání doručení:
- již provedený business přechod není vrácen zpět,
- rezervace zůstává ve stavu `CONFIRMED` nebo `CANCELLED`,
- odpověď obsahuje rozlišitelné varování,
- příslušný záznam v `notifications_outbox` zůstává evidovaný
  se stavem `FAILED` pro pozdější opakování.

**Shrnutí dopadu změny:**  
Zavedením schvalovacího procesu přibyl mezistav `PENDING_APPROVAL`,
který křečka dočasně blokuje a dočasně čerpá studentův denní limit.
Dále přibyly koncové stavy `REJECTED` a `EXPIRED`, které blokování
i čerpání limitu uvolňují. Vznikla nová role `Správce křečka`
a systémový plánovač úloh pro automatickou expiraci.

**Zbývající předpoklad / neznámá:**  
- Provozní parametry Outbox mechanismu (interval opakování a max. počet pokusů doručení e-mailových notifikací).
- Konkrétní externí Notification Service a její produkční integrace.
- Způsob perzistence a konfigurace systémového plánovače (Scheduler) v produkčním prostředí.

**Architektonické drivery přenesené do C03:**  
1. *ACID transakce / izolace při souběhu (Concurrency driver):* Zajištění, že dva souběžné požadavky na Confirm nezpůsobí dvojí rezervaci křečka ani překročení 30min denního limitu (`REQ-07`).
2. *Transactional Outbox Pattern (Reliability driver):* Spolehlivé doručování oznámení externí službou bez zablokování hlavní transakce.
3. *Asynchronní schvalovací workflow a Scheduler (Async/Timer driver):* Oddělení procesu žádosti a rozhodnutí, mechanismus pro automatickou expiraci bez manuálního zásahu.

**Commit / tag aplikace:**  
Pracovní větev cvičení C02 připravená pro C03.
- Ověřený commit implementace: `3d1c3593aa9b293f9b02dd90bfda476fe00fee13`

- Datum ověření: 1. 10. 2026.
- Příkaz: `npm run verify`.
- Výsledek: `30 PASS`, `0 FAIL`.

