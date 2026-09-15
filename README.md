# SWI_2027: Rezervační systém pro školního křečka 🐹

Tento projekt je vyvíjen v Node.js, Express, TypeScript a využívá PostgreSQL pro ukládání dat.

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
   V kořenovém adresáři se nachází soubor `.env`. Zkontrolujte jej a případně upravte přístupové údaje tak, aby odpovídaly vašemu lokálnímu nastavení PostgreSQL. Výchozí nastavení je:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=hamster_reservations
   ```

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
   - Kontrola "Domain-specific rule": Ověříme, že tento `student_id` nevyčerpal svůj denní limit 30 minut.
3. **→ persist** 
   - Zápis nového záznamu o rezervaci (stav `CONFIRMED`) do naší PostgreSQL tabulky `reservations`.
4. **→ trigger boundary** 
   - Odeslání asynchronní zprávy do "Notification Service" (např. potvrzovací e-mail studentovi).
5. **→ return reservation ID** 
   - Návrat HTTP statusu `201 Created` spolu s vygenerovaným ID rezervace v JSON odpovědi.
6. **→ automated check** 
   - Součástí releasu bude automatický integrační test, který tuto end-to-end cestu zavolá, získá ID a přes `GET /api/reservations/{id}` ověří uložení.
