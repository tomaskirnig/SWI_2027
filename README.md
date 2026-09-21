# Křečkomat: Rezervační systém pro školního křečka 🐹

Tento projekt je vyvíjen v Node.js, Express, TypeScript a využívá PostgreSQL pro ukládání dat.

## Tým

Název týmu: **Křečkomat**

Členové:

- Martin Kalus
- Tomáš Kirnig
- Petr Gála

Společný repozitář: [tomaskirnig/SWI_2027](https://github.com/tomaskirnig/SWI_2027).

## Struktura repozitáře

- `docs/` - Dokumentace projektu (architektura, záměr, záznamy o rozhodnutích a vývoji)
- `src/` - Zdrojové kódy aplikace v TypeScriptu

## Požadavky

Pro spuštění projektu potřebujete mít nainstalováno:
- [Node.js](https://nodejs.org/) (ideálně LTS verzi)
- [PostgreSQL](https://www.postgresql.org/) databázi

## Instalace a nastavení

1. **Klonování repozitáře** (pokud ho ještě nemáte lokálně):
   ```bash
   git clone git@github.com:tomaskirnig/SWI_2027.git
   cd SWI_2027
   ```

2. **Instalace závislostí:**
   ```bash
   npm install
   ```

3. **Nastavení prostředí:**
   Po naklonování vytvořte v kořeni projektu soubor `.env` jako kopii `.env.example`. Pokud už vlastní `.env` máte, ponechte jej.

   PowerShell:
   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

   Linux / macOS:
   ```bash
   test -e .env || cp .env.example .env
   ```

   V `.env` nastavte `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` a `DB_NAME` podle své PostgreSQL. Hodnotu `DB_PASSWORD` nahraďte skutečným heslem databázového uživatele. `PORT` určuje port aplikace (výchozí `3000`). Soubor `.env` je ignorovaný Gitem; sdílená šablona `.env.example` obsahuje pouze ukázkové hodnoty.

4. **Příprava databáze:**
   Ujistěte se, že vaše PostgreSQL databáze běží a vytvořte v ní databázi s názvem `hamster_reservations` (nebo jiným, pokud jste jej změnili v `.env`).

## Spuštění projektu

### Vývojový režim (Development)
Pro lokální vývoj s automatickým restartem serveru při změnách v kódu použijte:
```bash
npm run dev
```

### Produkční režim
Pro produkci je nejdříve potřeba kód zkompilovat z TypeScriptu do JavaScriptu a poté spustit:
```bash
npm run build
npm start
```
Server standardně poběží na adrese `http://localhost:3000`.

## CP1 walking skeleton

Tato end-to-end cesta (vytvoření rezervace křečka) bude první plně spustitelnou částí aplikace pro fázi CP1:

1. **`POST /api/reservations`** 
   - V těle požadavku přijde: `student_id`, `hamster_id` (např. "Ferda"), `start_time` a `end_time`.
2. **→ validate** 
   - Kontrola "Common rule": Ověříme v databázi, že Ferda v daný čas nemá jinou potvrzenou rezervaci.
   - Kontrola "Domain-specific rule": Ověříme, že požadovaný interval spolu s potvrzenými rezervacemi stejné dvojice `student_id` a `hamster_id` nepřekročí 30 minut v žádném kalendářním dni (`Europe/Prague`); přesná pravidla jsou v [Project Frame](docs/intent-and-change.md#domain-specific-business-rule).
3. **→ persist** 
   - Zápis nového záznamu o rezervaci ve stavu `DRAFT` do PostgreSQL tabulky `reservations`.
4. **→ return reservation ID**
   - Návrat HTTP statusu `201 Created` spolu s vygenerovaným ID rezervace v JSON odpovědi.
5. **→ automated check**
   - Automatický integrační test zavolá tuto cestu, získá ID a přes `GET /api/reservations/{id}` ověří uložená data a stav `DRAFT`.

Vytvoření návrhu ještě neblokuje čas křečka. Potvrzení bude samostatná operace, která znovu ověří dostupnost a denní limit a teprve potom změní stav na `CONFIRMED` a odešle oznámení přes Notification Service. Tato operace není součástí minimální cesty CP1 popsané výše.
