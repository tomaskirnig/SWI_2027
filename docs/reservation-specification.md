# Specification Baseline v0.1

## 1. Čtyři základní operace

Minimální verze systému Křečkomat pracuje se čtyřmi základními operacemi. Rezervovaným prostředkem je konkrétní školní křeček a uživatelem je student.

### OP-01 — Create Reservation — Vytvořit rezervaci

Student vytvoří návrh rezervace konkrétního křečka na zadaný časový interval. Úspěšně vytvořená rezervace je ve stavu `DRAFT`; samotné vytvoření tedy ještě křečka závazně nealokuje ani neblokuje jeho dostupnost. K potvrzení rezervace slouží samostatná operace Confirm Reservation.

### OP-02 — Check Availability — Zkontrolovat dostupnost

Student zjistí, zda je konkrétní křeček dostupný v požadovaném časovém intervalu. Dostupnost blokují pouze překrývající se rezervace stejného křečka ve stavu `CONFIRMED`; rezervace ve stavech `DRAFT` a `CANCELLED` ji neblokují. Operace pouze vrací výsledek a nemění stav žádné rezervace.

### OP-03 — Confirm Reservation — Potvrdit rezervaci

Student požádá o potvrzení své rezervace ve stavu `DRAFT`. Systém před změnou znovu ověří dostupnost křečka, zákaz překryvu potvrzených rezervací a denní limit 30 minut pro stejnou dvojici student–křeček. Při splnění pravidel rezervace přejde do stavu `CONFIRMED`, začne blokovat daný interval křečka a systém předá oznámení Notification Service. Při nesplnění pravidel zůstane rezervace ve stavu `DRAFT`.

### OP-04 — Cancel Reservation — Zrušit rezervaci

Student zruší svou existující rezervaci ve stavu `DRAFT` nebo `CONFIRMED`. Rezervace se fyzicky nemaže, ale přejde do stavu `CANCELLED`. Zrušená rezervace přestane blokovat dostupnost křečka a přestane se započítávat do denního limitu; systém předá oznámení Notification Service.

Operace `Approve Reservation` není součástí baseline v0.1. Případný schvalovací proces bude řešen až při změně požadované v části B zadání C02.
