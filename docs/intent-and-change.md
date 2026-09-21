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

Služba pro odesílání oznámení.

Po potvrzení nebo zrušení rezervace systém odešle uživateli oznámení.

## Assumption

Předpokládáme, že každý student má školní e-mailovou adresu, na kterou lze doručovat oznámení o rezervacích. Dostupnost těchto adres je potřeba ověřit před napojením Notification Service.

## Unknown

Zatím nevíme, zda bude potvrzení rezervace prováděno automaticky systémem, nebo ručně správcem.
