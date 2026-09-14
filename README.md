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
