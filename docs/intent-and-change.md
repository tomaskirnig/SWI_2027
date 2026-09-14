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

Rezervace je nejprve vytvořena ve stavu DRAFT. Po úspěšné kontrole dostupnosti a splnění pravidel může být potvrzena a přejde do stavu CONFIRMED.

Další možné přechody:

* DRAFT → CANCELLED
* CONFIRMED → CANCELLED

## Common business rule

Dvě potvrzené rezervace stejného křečka se nesmí časově překrývat.

## Domain-specific business rule

Jeden student může mít jednoho křečka rezervovaného maximálně 30 minut denně.

## External / system boundary

Služba pro odesílání oznámení.

Po potvrzení nebo zrušení rezervace systém odešle uživateli oznámení.

## Assumption

Předpokládáme, že každý křeček může být v jeden okamžik rezervován pouze jedním studentem.

## Unknown

Zatím nevíme, zda bude potvrzení rezervace prováděno automaticky systémem, nebo ručně správcem.
