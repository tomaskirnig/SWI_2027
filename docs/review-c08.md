# Peer review C08

Zkontroluj prosím [kartu CR-08](intent-and-change.md#c08--cr-08-rozhodný-čas-při-změně-stavu-rezervace) jako druhý člen týmu. Cílem je posoudit návrh a rozhodnout před implementací v C09. Pro požadovaný postup použij [zadání C08](../zadani/C08_FINAL.html).

## Co zrevidovat

1. **Pravidla a stavové přechody.** Porovnej [akceptační podmínky](intent-and-change.md#akceptační-podmínky) se [specifikací v0.2](reservation-specification.md) a [stavovým diagramem](../DIAGRAMS.md#21-aktualizovaný-stavový-diagram-životního-cyklu-v02). Confirm a nové Cancel mohou uspět přesně 15 minut před začátkem. Pro Decide je přesně jedna hodina před začátkem už po povolené hranici. Opakované Cancel vlastní `CANCELLED` má zůstat idempotentní.
2. **Volba řešení.** Projdi [matici dopadů](intent-and-change.md#matice-dopadů) a [varianty](intent-and-change.md#varianty-a-rozhodnutí). U doporučené varianty A zkontroluj, že se čas odečte až po všech potřebných zámcích, u Decide i po zámku křečka. Prověř také předpoklad, že běžná cesta běží bez `x-current-time` a přesná hranice se zkouší řízeným časem. Pokud dává smysl varianta B s časem z PostgreSQL, uveď konkrétní důvod.
3. **Důkaz a předávka.** Přečti [výsledky TC-C08-01 a TC-C08-02](evidence-and-evolution.md#c08--ověření-f1-na-výchozí-verzi) a [plán ověření pro C09](intent-and-change.md#předávka-do-c09-po-schválení). U odmítnutí musí ověření zahrnout HTTP odpověď, stav rezervace i outbox. Zkontroluj pokrytí Confirm, obou rozhodnutí Decide a nového i opakovaného Cancel. Pokud test chybí, popiš vstup a očekávaný výsledek.

Chceš-li pokus zopakovat, použij [návod a skript](../README.md#ověření-lhůty-confirm-pro-c08) s izolovanou databází. Na výchozí verzi očekávej `TC-C08-01 PASS` a `TC-C08-02 FAIL`. Druhý výsledek je reprodukce vady, kterou má řešit C09.

## Kam zapsat výsledek

Na této větvi otevři [Záznam peer review v kartě CR-08](intent-and-change.md#záznam-peer-review). Doplň jméno, datum, alespoň jeden prověřený předpoklad se závěrem a konkrétní připomínky. Uveď, jestli jsi vycházel z uložených důkazů nebo test spustil, a doporuč variantu a další rozhodnutí. Změnu můžeš uložit přímo v GitHubu. Pokud úpravu do větve ukládá jiný člen, pošli mu vyplněný záznam.

Vlastník změny po vypořádání připomínek zapíše rozhodnutí týmu do karty CR-08. Pro `DEFER` uvede chybějící údaj, vlastníka a podmínku, za které se k rozhodnutí vrátí. Po `ACCEPT` slouží karta a její testovací plán jako vstup do C09.
