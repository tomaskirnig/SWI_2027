# Diagramy systému Křečkomat (C02)

Tento dokument obsahuje vizuální specifikaci chování systému **Křečkomat** pro fázi **C02**. Diagramy jsou zapsány ve formátu [Mermaid](https://mermaid.js.org/) a lze je přímo prohlížet v Markdown náhledu (např. v GitHubu nebo VS Code) i v [Mermaid Live Editoru](https://mermaid.live).

Diagramy vycházejí z doménových pravidel a požadavků definovaných v [docs/reservation-specification.md](docs/reservation-specification.md) a zohledňují rozšíření schvalovacího procesu podle [zadani.txt](zadani.txt) (Část B).

---

## Obsah

- [Část 1: Baseline v0.1 — Minimální systém](#část-1-baseline-v01--minimální-systém)
  - [1.1 Diagram případů užití (Use Case diagram — bod 9a)](#11-diagram-případů-užití-use-case-diagram--bod-9a)
  - [1.2 Stavový diagram životního cyklu Reservation (bod 9b)](#12-stavový-diagram-životního-cyklu-reservation-bod-9b)
  - [1.3 Diagram aktivit — OP-03: Potvrzení rezervace (bod 9c)](#13-diagram-aktivit--op-03-potvrzení-rezervace-bod-9c)
  - [1.4 Diagram aktivit — OP-04: Zrušení rezervace (bod 9c)](#14-diagram-aktivit--op-04-zrušení-rezervace-bod-9c)
- [Část 2: Baseline v0.2 — Změna: Schvalovací proces](#část-2-baseline-v02--změna-schvalovací-proces)
  - [2.1 Aktualizovaný stavový diagram životního cyklu (v0.2)](#21-aktualizovaný-stavový-diagram-životního-cyklu-v02)
  - [2.2 Aktualizovaný diagram případů užití (v0.2)](#22-aktualizovaný-diagram-případů-užití-v02)

---

# Část 1: Baseline v0.1 — Minimální systém

## 1.1 Diagram případů užití (Use Case diagram — bod 9a)

Diagram znázorňuje hranici systému Křečkomat, primárního aktéra (**Student**), podpůrný externí systém (**Notification Service**) a 4 základní operace minimálního systému.

- **Vazba na pravidla:** 
  - `OP-01` až `OP-04` odpovídají 4 základním operacím.
  - Asynchronní předání notifikací z operací Confirm a Cancel odpovídá pravidlu `BR-06`.

```mermaid
flowchart LR
    classDef actorStyle fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:#01579b;
    classDef extStyle fill:#ede7f6,stroke:#7e57c2,stroke-width:2px,color:#311b92;
    classDef ucStyle fill:#ffffff,stroke:#37474f,stroke-width:1.5px,color:#263238;

    Student["👤 Student<br/><i>(primární aktér)</i>"]:::actorStyle
    
    subgraph System[" Systém Křečkomat (hranice systému) "]
        UC1(["OP-01: Vytvořit rezervaci (Create)"]):::ucStyle
        UC2(["OP-02: Zkontrolovat dostupnost (Check Availability)"]):::ucStyle
        UC3(["OP-03: Potvrdit rezervaci (Confirm)"]):::ucStyle
        UC4(["OP-04: Zrušit rezervaci (Cancel)"]):::ucStyle
    end

    NotificationService["🔔 Notification Service<br/><i>(podpůrný externí systém)</i>"]:::extStyle

    Student --> UC1
    Student --> UC2
    Student --> UC3
    Student --> UC4

    UC3 -.->|"předání oznámení (BR-06)"| NotificationService
    UC4 -.->|"předání oznámení (BR-06)"| NotificationService
```

---

## 1.2 Stavový diagram životního cyklu Reservation (bod 9b)

Zachycuje celý životní cyklus rezervace v Baseline v0.1, přípustné stavy (`DRAFT`, `CONFIRMED`, `CANCELLED`), podmínky přechodů a korektní ukončení životnosti.

- **Vazba na pravidla:**
  - `BR-01`: Sémantika intervalů a časů.
  - `BR-02`: Invariant neexistence překryvu rezervací `CONFIRMED` stejného křečka.
  - `BR-03`: Politika rušení (`currentTime < start`, idempotentní úspěch pro `CANCELLED`).
  - `BR-04`: Denní limit 30 minut student–křeček.
  - `BR-05`: Význam stavů (pouze `CONFIRMED` alokuje křečka a čerpá denní limit).
- **Chování DRAFTu při expiraci času:**
  - Pokud student potvrdí návrh včas (`currentTime < start`), přejde do `CONFIRMED`.
  - Pokud uplyne termín začátku (`currentTime >= start`) a student se pokusí potvrdit, klientské rozhraní nabídne posun času o prodlevu. Pokud návrh není potvrzen, končí bez alokace prostředků.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : OP-01 Create Reservation\n[křeček aktivní, budoucí interval, předběžná nekolize a limit]

    note right of DRAFT
        Návrh neblokuje křečka ani limit.
        Při pokusu o potvrzení po začátku UI nabídne
        posunout časy o prodlevu; nepotvrzený
        návrh po termínu expiruje bez alokace.
    end note

    DRAFT --> CONFIRMED : OP-03 Confirm Reservation\n[currentTime < start, aktivní křeček, žádný překryv, limit <= 30 min]
    DRAFT --> CANCELLED : OP-04 Cancel Reservation\n[storno před začátkem]
    DRAFT --> [*] : Uplynutí termínu bez potvrzení / opuštění návrhu

    note right of CONFIRMED
        Jediný stav v v0.1, který
        závazně alokuje křečka
        a čerpá denní limit 30 min.
    end note

    CONFIRMED --> CANCELLED : OP-04 Cancel Reservation\n[storno před začátkem rezervace: currentTime < start]
    CONFIRMED --> [*] : Uplynutí termínu rezervace (proběhla)

    note right of CANCELLED
        Uvolňuje alokaci i limit.
        Opakovaný Cancel je idempotentní
        (beze změny dat a bez nové notifikace).
    end note

    CANCELLED --> [*] : Konec životního cyklu / archivace
```

---

## 1.3 Diagram aktivit — OP-03: Potvrzení rezervace (bod 9c)

Modeluje procesní tok a rozhodovací logiku operace **Potvrzení rezervace** pomocí **plaveckých drah (Swimlanes)**. Znázorňuje rozdělení odpovědnosti mezi klienta, validační vrstvu, atomickou databázovou transakci (ochrana proti souběhu `REQ-07`) a externí notifikační službu.

- **Barevné rozlišení:**
  - 🟢 **Zelená:** Úspěšné dokončení operace.
  - 🔴 **Červená:** Odmítnutí požadavku (beze změny stavu).
  - 🟡 **Žlutá:** Úspěšné potvrzení s varováním (selhání notifikace, zařazeno do retry).

```mermaid
flowchart TD
    classDef success fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#155724;
    classDef fail fill:#f8d7da,stroke:#dc3545,stroke-width:2px,color:#721c24;
    classDef warn fill:#fff3cd,stroke:#ffc107,stroke-width:2px,color:#856404;
    classDef decision fill:#e8f4fd,stroke:#0d6efd,stroke-width:1.5px,color:#084298;
    classDef step fill:#f8f9fa,stroke:#495057,stroke-width:1.5px,color:#212529;

    subgraph ClientLane["👤 Student (Klient)"]
        ReqConfirm(["Požadavek na potvrzení (OP-03)"]):::step
        RespSuccess(["Konec: Úspěšně potvrzeno"]):::success
        RespWarning(["Konec: Potvrzeno s varováním (notifikace k retry)"]):::warn
        RespFail(["Konec: Odmítnuto (chyba, beze změny)"]):::fail
    end

    subgraph ApiLane["⚙️ Křečkomat API (Validace)"]
        CheckAuth{"Existuje rezervace a<br/>patří studentovi?"}:::decision
        CheckState{"Je stav rezervace<br/>DRAFT?"}:::decision
        CheckTime{"Platí<br/>currentTime < start?"}:::decision
        PromptTime["Nabídnout v UI posun časů o prodlevu /<br/>odmítnout: termín začátku již nastal"]:::fail
        CheckHamster{"Je křeček<br/>aktivní?"}:::decision
        RejectAuth["Odmítnout: Neexistující nebo cizí"]:::fail
        RejectState["Odmítnout: Neplatný stav"]:::fail
        RejectHamster["Odmítnout: Křeček není aktivní"]:::fail
    end

    subgraph DbLane["🗄️ Databáze (ACID Transakce — ochrana proti souběhu REQ-07)"]
        LockAndCheck{"Transakční kontrola:<br/>Překryv s CONFIRMED nebo<br/>překročení limitu 30 min?"}:::decision
        RejectConflict["Rollback & odmítnout:<br/>Kolize nebo překročen limit"]:::fail
        CommitConfirm["Commit transakce:<br/>Změna stavu na CONFIRMED<br/>(alokace křečka a čerpání limitu)"]:::step
    end

    subgraph NotifLane["🔔 Notification Service"]
        SendNotif{"Předání zprávy<br/>Notification Service"}:::decision
        EnqueueRetry["Evidovat zprávu k pozdějšímu opakování<br/>(Outbox / Retry queue)"]:::warn
    end

    ReqConfirm --> CheckAuth
    CheckAuth -- "Ne" --> RejectAuth --> RespFail
    CheckAuth -- "Ano" --> CheckState
    
    CheckState -- "Ne" --> RejectState --> RespFail
    CheckState -- "Ano" --> CheckTime
    
    CheckTime -- "Ne" --> PromptTime --> RespFail
    CheckTime -- "Ano" --> CheckHamster
    
    CheckHamster -- "Ne" --> RejectHamster --> RespFail
    CheckHamster -- "Ano" --> LockAndCheck

    LockAndCheck -- "Kolize / Limit" --> RejectConflict --> RespFail
    LockAndCheck -- "V pořádku" --> CommitConfirm

    CommitConfirm --> SendNotif
    SendNotif -- "Úspěch" --> RespSuccess
    SendNotif -- "Selhání" --> EnqueueRetry --> RespWarning
```

---

## 1.4 Diagram aktivit — OP-04: Zrušení rezervace (bod 9c)

Znázorňuje průběh operace **Zrušení rezervace** rozdělený do plaveckých drah. Demonstruje okamžitý idempotentní úspěch při opakovaném volání na již zrušenou rezervaci (`REQ-09`), časové pravidlo stornování a spolehlivé uvolnění křečka.

```mermaid
flowchart TD
    classDef success fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#155724;
    classDef fail fill:#f8d7da,stroke:#dc3545,stroke-width:2px,color:#721c24;
    classDef warn fill:#fff3cd,stroke:#ffc107,stroke-width:2px,color:#856404;
    classDef decision fill:#e8f4fd,stroke:#0d6efd,stroke-width:1.5px,color:#084298;
    classDef step fill:#f8f9fa,stroke:#495057,stroke-width:1.5px,color:#212529;

    subgraph ClientLane["👤 Student (Klient)"]
        ReqCancel(["Požadavek na zrušení (OP-04)"]):::step
        RespIdempotent(["Konec: Idempotentní úspěch (beze změny a bez notifikace)"]):::success
        RespCancelSuccess(["Konec: Rezervace úspěšně zrušena"]):::success
        RespCancelWarn(["Konec: Zrušeno s varováním notifikace"]):::warn
        RespCancelFail(["Konec: Odmítnuto (chyba, beze změny)"]):::fail
    end

    subgraph ApiLane["⚙️ Křečkomat API (Validace)"]
        CheckAuthCancel{"Existuje rezervace a<br/>patří studentovi?"}:::decision
        CheckAlreadyCancelled{"Je již ve stavu<br/>CANCELLED?"}:::decision
        CheckAllowedState{"Je ve stavu<br/>DRAFT nebo CONFIRMED?"}:::decision
        CheckCancelTime{"Platí časové pravidlo<br/>currentTime < start?"}:::decision
        RejectAuthCancel["Odmítnout: Neexistující nebo cizí"]:::fail
        RejectInvalidState["Odmítnout: Nepovolený výchozí stav"]:::fail
        RejectPastTime["Odmítnout: Rezervace již začala / proběhla"]:::fail
    end

    subgraph DbLane["🗄️ Databáze (Perzistence)"]
        SetCancelled["Změna stavu na CANCELLED<br/>(uvolnění alokace a denního limitu,<br/>fyzické zachování záznamu)"]:::step
    end

    subgraph NotifLane["🔔 Notification Service"]
        SendCancelNotif{"Předání zprávy<br/>Notification Service"}:::decision
        EnqueueCancelRetry["Evidovat zprávu k pozdějšímu opakování<br/>(Outbox / Retry queue)"]:::warn
    end

    ReqCancel --> CheckAuthCancel
    CheckAuthCancel -- "Ne" --> RejectAuthCancel --> RespCancelFail
    CheckAuthCancel -- "Ano" --> CheckAlreadyCancelled

    CheckAlreadyCancelled -- "Ano" --> RespIdempotent
    CheckAlreadyCancelled -- "Ne" --> CheckAllowedState

    CheckAllowedState -- "Ne" --> RejectInvalidState --> RespCancelFail
    CheckAllowedState -- "Ano" --> CheckCancelTime

    CheckCancelTime -- "Ne" --> RejectPastTime --> RespCancelFail
    CheckCancelTime -- "Ano" --> SetCancelled

    SetCancelled --> SendCancelNotif
    SendCancelNotif -- "Úspěch" --> RespCancelSuccess
    SendCancelNotif -- "Selhání" --> EnqueueCancelRetry --> RespCancelWarn
```

---

# Část 2: Baseline v0.2 — Změna: Schvalovací proces

Tato část rozšiřuje systém podle **Části B zadání C02**:
> *„Některé Resources vyžadují schválení oprávněnou osobou dříve, než se Reservation může stát CONFIRMED. Schválení může být opožděno, zamítnuto nebo může vypršet.“*

### Rozhodnutí o chování v0.2:
1. **Dva režimy potvrzení křečků:**
   - **Běžný křeček (nevyžaduje schválení):** Přímé automatické potvrzení `DRAFT → CONFIRMED` (stejná pravidla kolize a limitu jako ve v0.1).
   - **Křeček vyžadující schválení (speciální resource):** Přechod `DRAFT → PENDING_APPROVAL`.
2. **Blokování prostředku v `PENDING_APPROVAL`:**
   - Aby jiný student nemohl termín mezitím zabrat, rezervace ve stavu `PENDING_APPROVAL` **křečka dočasně blokuje a započítává se do denního limitu**.
3. **Pravidla expirace a rušení:**
   - **Expirace schválení:** Pokud učitel nerozhodne nejpozději **1 hodinu před začátkem rezervace** (nebo do okamžiku začátku), systém rezervaci automaticky převede do `EXPIRED` a křeček i limit se uvolní.
   - **Storno studentem:** Student může čekající žádost zrušit (`CANCELLED`) nejpozději 15 minut před začátkem rezervace, čímž se mu limit uvolní.

---

## 2.1 Aktualizovaný stavový diagram životního cyklu (v0.2)

Zachycuje všechny stavy včetně schvalovacího procesu (`PENDING_APPROVAL`), zamítnutí (`REJECTED`) a expirace (`EXPIRED`) a obsahuje řádné zakončení životního cyklu (`[*]`).

```mermaid
stateDiagram-v2
    [*] --> DRAFT : OP-01 Create

    note right of DRAFT
        Návrh neblokuje křečka.
        Ukončí se opuštěním po termínu.
    end note

    DRAFT --> CONFIRMED : OP-03 Confirm [nevyžaduje schválení & splňuje pravidla]
    DRAFT --> PENDING_APPROVAL : OP-03 Confirm [vyžaduje schválení & splňuje pravidla]
    DRAFT --> CANCELLED : OP-04 Cancel [storno před začátkem]
    DRAFT --> [*] : Uplynutí termínu bez potvrzení
    
    note right of PENDING_APPROVAL
        Blokuje křečka před kolizí
        a dočasně čerpá denní limit.
    end note

    PENDING_APPROVAL --> CONFIRMED : OP-05 Approve [schváleno učitelem před začátkem]
    PENDING_APPROVAL --> REJECTED : OP-05 Reject [zamítnuto učitelem]
    PENDING_APPROVAL --> EXPIRED : Automatický časovač [1h před začátkem bez rozhodnutí]
    PENDING_APPROVAL --> CANCELLED : OP-04 Cancel [storno studentem před začátkem]

    CONFIRMED --> CANCELLED : OP-04 Cancel [storno studentem před začátkem]
    
    note right of CANCELLED
        Idempotentní opakování.
    end note

    CONFIRMED --> [*] : Uplynutí termínu rezervace (proběhla)
    REJECTED --> [*] : Uvolněna alokace i limit
    EXPIRED --> [*] : Uvolněna alokace i limit
    CANCELLED --> [*] : Uvolněna alokace i limit
```

---

## 2.2 Aktualizovaný diagram případů užití (v0.2)

Do systému přibývá nová role aktéra (**Schvalovatel / Učitel**), systémový aktér (**Automatický časovač / Scheduler**) a nová operace **OP-05: Rozhodnout o rezervaci (Approve / Reject)**. Notifikační služba informuje učitele o nové žádosti a studenta o výsledku schválení/zamítnutí.

```mermaid
flowchart LR
    classDef actorStyle fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:#01579b;
    classDef extStyle fill:#ede7f6,stroke:#7e57c2,stroke-width:2px,color:#311b92;
    classDef timerStyle fill:#fff8e1,stroke:#ffa000,stroke-width:2px,color:#ff6f00;
    classDef ucStyle fill:#ffffff,stroke:#37474f,stroke-width:1.5px,color:#263238;

    Student["👤 Student<br/><i>(primární aktér)</i>"]:::actorStyle
    Approver["🧑‍🏫 Schvalovatel / Učitel<br/><i>(oprávněná osoba)</i>"]:::actorStyle
    Timer["⏱️ Systémový časovač<br/><i>(automatický plánovač)</i>"]:::timerStyle
    NotificationService["🔔 Notification Service<br/><i>(podpůrný externí systém)</i>"]:::extStyle

    subgraph System[" Systém Křečkomat (hranice systému v0.2) "]
        UC1(["OP-01: Vytvořit rezervaci (Create)"]):::ucStyle
        UC2(["OP-02: Zkontrolovat dostupnost (Check Availability)"]):::ucStyle
        UC3(["OP-03: Potvrdit / požádat o schválení (Confirm)"]):::ucStyle
        UC4(["OP-04: Zrušit rezervaci (Cancel)"]):::ucStyle
        UC5(["OP-05: Rozhodnout o rezervaci (Approve / Reject)"]):::ucStyle
        UC6(["OP-06: Expirovat nevyřízené žádosti (Expire)"]):::ucStyle
    end

    Student --> UC1
    Student --> UC2
    Student --> UC3
    Student --> UC4

    Approver --> UC5
    Timer --> UC6

    UC3 -.->|"oznámení studentovi / žádost učiteli"| NotificationService
    UC4 -.->|"oznámení o zrušení"| NotificationService
    UC5 -.->|"oznámení o schválení / zamítnutí studentovi"| NotificationService
    UC6 -.->|"oznámení o vypršení termínu"| NotificationService
```
