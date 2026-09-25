# Architektura a rozhodnutí (Architecture and Decisions)

Zde budou zaznamenávána důležitá architektonická rozhodnutí (Architecture Decision Records - ADR) a popis technického řešení.

## Technologický stack
- **Backend:** Node.js, Express, TypeScript
- **Databáze:** PostgreSQL hostovaná na platformě Supabase (cloud DB), klientská knihovna `pg` (node-postgres)
- **Připojení k DB:** Zabezpečené SSL spojení s podporou `DATABASE_URL` a Supabase Connection Pooleru
- **Vývojové nástroje:** TypeScript compiler (`tsc`), `tsx` pro vývojový režim

## Zdůvodnění volby stacku

Node.js a Express usnadňují tvorbu rezervačního API. TypeScript pomáhá zachytit typové chyby při kompilaci.

PostgreSQL se hodí pro propojená data uživatelů, křečků a rezervací a podporuje transakce (`BEGIN ... COMMIT`, `FOR UPDATE`) pro zachování konzistence dat a ochranu proti souběhu (`REQ-07`). Knihovna `pg` umožňuje přímou práci s SQL bez další vrstvy ORM.

Pro hosting databáze byl zvolen **Supabase (spravovaný PostgreSQL v cloudu)** namísto lokální instalace. Výhodou je dostupnost pro všechny členy týmu bez nutnosti lokální správy serveru, automatické zálohy a integrovaný Connection Pooler pro efektivní správu spojení. Schéma tabulek (`hamsters`, `reservations`, `notifications_outbox`) a výchozí data jsou automaticky inicializovány aplikací při startu.
