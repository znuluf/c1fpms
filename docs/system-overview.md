# How FPMS works

> **Development copy.** Written for release 1.0.0 in `znuluf/try-prod`; this development project works the same way,
> except that its database migrations are generated in each Codespace instead of committed, and read-committed snapshot
> is set by `.devcontainer/start-fpms.sh` rather than by the migration `DatabaseSettings`.

A guide to the Farm Production Management System (FPMS) for presenting and understanding it: what the parts are, where
they run, what happens when someone presses Save, and where to look in the code. Diagrams are drawn in Mermaid, which
GitHub shows as pictures.

Related guides:
- [API and keys](api-and-keys.md): every endpoint, how sign-in works, and every secret the system uses.
- [Database queries](database-queries.md): what the reads and writes look like in SQL.
- [Database development](database.md): how the database is defined and changed.
- [Reliability](reliability.md): simultaneous saves, lost connections and failures.

---

## 1. The system in one picture

FPMS is three programs on one farm-office PC, used from tablets and phones over the farm's Wi-Fi. There is no Internet
connection and no outside service: everything the farm needs is on that PC.

```mermaid
flowchart LR
    subgraph Farm["Farm (no Internet)"]
        T["Tablets and phones<br/>Farm Owner, Farm Technician"]
        A["Office browser<br/>System Administrator"]
        subgraph PC["Farm-office PC"]
            API["FPMS API<br/>ASP.NET Core (.NET 9)<br/>also serves the web app"]
            DB[("SQL Server<br/>database CapstoneDb")]
            JOBS["Scheduled backup jobs<br/>(Task Scheduler or cron)"]
        end
        USB[("Backup drive /<br/>off-site copy")]
    end
    T -- "HTTPS over Wi-Fi<br/>JSON + sign-in token" --> API
    A -- HTTPS --> API
    API -- "EF Core (SQL)" --> DB
    JOBS -- "BACKUP DATABASE / LOG" --> DB
    JOBS --> USB
    JOBS -- "writes a BackupRuns row" --> DB
```

| Part | What it is | Where |
|---|---|---|
| **Web app** | An Angular 19 single-page app: the screens people use. Built once into plain files that the API serves. | `angular/` |
| **API** | An ASP.NET Core Web API built on ASP.NET Boilerplate (ABP) 10.2. Holds every business rule, checks every save, and is the only thing that talks to the database. | `aspnet-core/src/` |
| **Database** | SQL Server (Express on the farm PC). One database holds every farm's data, each row tagged with its farm. | Created by `Capstone.Migrator` |
| **Backup jobs** | Shell or PowerShell scripts run by the operating system's scheduler. Not part of the app. | `scripts/backup/` |

---

## 2. Who uses it

| Role | What they do | Sees |
|---|---|---|
| **Farm Technician** | Records the daily work at the ponds: feedings, water quality, growth samples, mortality, pond preparation, harvests, receiving fry | Their farm only; corrects only their own entries |
| **Farm Owner** | Everything a technician does, plus setup, stocking decisions, sales, users, reports and corrections of anyone's entries | Their farm only |
| **System Administrator** | Installs and looks after the server: farms, account recovery, reference data, health and logs | Never sees farm records |

The exact permissions of each role are in [API and keys, section 5](api-and-keys.md#5-roles-and-permissions).

---

## 3. Inside the API: four layers

The API is split into projects that only depend downwards, so the business rules never depend on the web or the database
details.

```mermaid
flowchart TB
    subgraph Web["Capstone.Web.Host + Capstone.Web.Core"]
        H["Hosting, HTTPS, CORS, /health, Swagger (development)<br/>Sign-in endpoint: TokenAuthController"]
    end
    subgraph App["Capstone.Application"]
        S["Application services, one per subject<br/>PondAppService, FeedingAppService, HarvestAppService, SaleAppService …<br/>Each public method is an API endpoint"]
    end
    subgraph Core["Capstone.Core"]
        D["Entities (Pond, PondBatch, Harvest …), rules, permission names,<br/>indicator formulas, farm clock"]
    end
    subgraph Data["Capstone.EntityFrameworkCore"]
        E["CapstoneDbContext, table mapping, migrations,<br/>row locks, number sequences, seed data"]
    end
    DB[("SQL Server")]
    Web --> App --> Core
    App --> Data --> Core
    Data --> DB
    M["Capstone.Migrator<br/>(console: applies migrations, seeds)"] --> Data
```

| Layer | Holds | Example file |
|---|---|---|
| Web | How requests arrive: HTTPS, sign-in, health check | `Capstone.Web.Host/Startup/Startup.cs`, `Capstone.Web.Core/Controllers/TokenAuthController.cs` |
| Application | What each screen can do: list, get, create, update, void; permission checks; input validation | `Capstone.Application/Logbooks/FeedingAppService.cs` |
| Core (domain) | What the farm's records are and the rules that never change with the screen | `Capstone.Core/Production/PondBatch.cs`, `IndicatorCalculator` |
| Data | How records become tables and SQL | `Capstone.EntityFrameworkCore/EntityFrameworkCore/FpmsModelConfiguration.cs` |

ABP turns every public method of an application service into a web endpoint automatically:
`FeedingAppService.SaveSheet` becomes `POST /api/services/app/Feeding/SaveSheet`. There are no hand-written controllers
except sign-in.

## 4. Inside the web app

```mermaid
flowchart LR
    P["Page component<br/>e.g. feeding-sheet.component.ts"] --> B["FpmsPage base<br/>busy(), act(), drafts, permissions"]
    B --> C["FpmsApiService<br/>GET/POST/PUT/DELETE to /api/services/app/…"]
    C --> I["ABP HTTP interceptor<br/>adds the sign-in token and farm,<br/>shows server errors"]
    I --> API(("API"))
    P --> O["FpmsOutbox<br/>keeps new entries when offline"]
    O --> API
    P --> F["FormDrafts<br/>unsaved typing in the browser"]
```

- **Pages** (`angular/src/app/fpms/…`) are standalone Angular components, one per screen. They extend `FpmsPage`
  (`angular/src/shared/fpms/fpms-page.ts`), which gives every page the API client, the busy flag that stops a double tap,
  permission checks and drafts.
- **The API client** (`angular/src/shared/fpms/api.service.ts`) builds the URL from the service and method names.
- **The interceptor** from `abp-ng2-module` adds `Authorization: Bearer <token>` and the farm to every request, unwraps
  the answer and shows server errors in a dialog.
- **Browser storage** keeps three things, per farm and person: form drafts (24 hours), the outbox of entries kept while
  offline (until sent), and small preferences such as the theme.

---

## 5. What happens when someone presses Save

The example is a technician saving two feedings on the feeding sheet.

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Technician (tablet)
    participant UI as Web app
    participant API as API (FeedingAppService)
    participant DB as SQL Server
    Tech->>UI: Taps Save on the feeding sheet
    UI->>UI: Shows the review, disables Save while busy
    UI->>API: POST /api/services/app/Feeding/SaveSheet<br/>token + farm + sessions (each with a ClientRequestId)
    API->>API: Checks the token, the user's security stamp<br/>and permission Farm.Logs.Create
    API->>API: Validates input (kg, lots, dates)
    API->>DB: BEGIN TRANSACTION
    API->>DB: Waits for any save with the same request ID (sp_getapplock)
    API->>DB: SELECT … WHERE ClientRequestId = @id (already saved?)
    API->>DB: SELECT the batch, the lots, today's feedings (farm filter added automatically)
    API->>DB: INSERT FpmsFeedingSessions, INSERT FpmsStockMovements (feed drawn)
    API->>DB: COMMIT
    API-->>UI: 200 OK {"result": [...], "success": true}
    UI->>UI: Marks the tiles saved, clears the draft
    UI-->>Tech: "Saved 2 feedings." and any warnings
```

What protects the farm's data on the way (details in [reliability.md](reliability.md)):

| Step | Protection |
|---|---|
| 2 | The Save button is disabled while saving, so a double tap cannot send twice. |
| 3 | Each new entry carries a request ID; a retry returns the record already saved. |
| 4 | Only a signed-in person with the right permission gets through; a deactivated account is signed out within a minute. |
| 5 | Every value is checked again on the server; the screen's checks are only a convenience. |
| 6–10 | One transaction: all of it is saved or none of it. Two saves of the same thing wait for each other. |
| 8 | Every query is limited to the signed-in person's farm and skips deleted rows, without the code asking for it. |

If the Wi-Fi drops at step 3, the entry is kept on the tablet and sent later (section 7).

---

## 6. Signing in

```mermaid
sequenceDiagram
    actor U as Person
    participant UI as Web app
    participant API as API
    participant DB as SQL Server
    U->>UI: Farm code, username, password
    UI->>API: POST /api/services/app/Account/IsTenantAvailable {tenancyName}
    API->>DB: Find the farm by code
    API-->>UI: farm id
    UI->>UI: Remembers the farm (Abp.TenantId cookie)
    UI->>API: POST /api/TokenAuth/Authenticate {userNameOrEmailAddress, password}
    API->>DB: Check the password hash, lockout, active
    API-->>UI: accessToken (JWT, 4 hours), shouldChangePassword
    UI->>UI: Stores the token (Abp.AuthToken cookie)
    UI->>API: Every later request: Authorization: Bearer <token>
```

The token is signed with the server's secret signing key, so it cannot be forged or changed. It carries who the person
is and which farm they belong to; the farm is never taken from what the screen sends. Full detail in
[API and keys](api-and-keys.md#2-signing-in-and-the-access-token).

---

## 7. Working without a connection

```mermaid
flowchart TD
    S["Person saves a new log entry,<br/>feeding or preparation entry"] --> R{"Server answers?"}
    R -- yes, saved --> OK["Saved"]
    R -- "yes, refused<br/>(rule broken)" --> ERR["Error shown;<br/>typing stays on the page"]
    R -- "no answer" --> K["Kept on this tablet<br/>(browser storage, per person)"]
    K --> Q["Top bar: '1 to send'"]
    Q --> T{"Connection back?<br/>(app opens, network event,<br/>every 20 s)"}
    T -- no --> Q
    T -- yes --> SEND["Sent oldest first<br/>(same request ID: never twice)"]
    SEND --> A{"Accepted?"}
    A -- yes --> DONE["'1 kept entry sent.'<br/>leaves the list"]
    A -- no --> NA["'Not accepted: reason'<br/>Try again or Discard"]
```

Corrections, harvests and sales are not kept offline: they need the server's current version, or give a lot code or
receipt number to hand over on the spot. DEC-135.

---

## 8. The data, in one picture

The database has 52 farm tables (`Fpms…`) plus ABP's own (`Abp…`: farms, users, roles, audit log). The core of the
farm's records:

```mermaid
erDiagram
    AbpTenants ||--o{ FpmsPonds : "farm has"
    FpmsHatcherySources ||--o{ FpmsFryDeliveries : supplies
    FpmsFryDeliveries ||--o| FpmsProductionCycles : "starts"
    FpmsProductionCycles ||--|{ FpmsPondBatches : "one batch per pond"
    FpmsPonds ||--o{ FpmsPondBatches : "grows"
    FpmsPondBatches ||--o{ FpmsBatchTechnicians : "looked after by"
    FpmsPondBatches ||--o{ FpmsFeedingSessions : "fed"
    FpmsPondBatches ||--o{ FpmsProductionLogs : "water, growth, mortality, notes"
    FpmsFeedingSessions ||--o{ FpmsStockMovements : "draws feed"
    FpmsInventoryLots ||--o{ FpmsStockMovements : "moves"
    FpmsPondBatches ||--o{ FpmsHarvests : "harvested"
    FpmsHarvests ||--|{ FpmsHarvestGradeLines : "kg per size grade"
    FpmsHarvests ||--o{ FpmsHarvestCrates : "weighed in crates"
    FpmsBuyers ||--o{ FpmsSales : buys
    FpmsSales ||--|{ FpmsSaleLines : "lines"
    FpmsHarvestGradeLines ||--o{ FpmsSaleLines : "sold as"
    FpmsSales ||--o{ FpmsSalePayments : "paid by"
```

The life of a crop, in the order the farm works:

1. **Ponds** are prepared (`FpmsPondPreparationRounds`, `…Entries`) until they are Prepared.
2. **Fry are delivered** (`FpmsFryDeliveries`): ordered, in transit, received at the gate, with each step in
   `FpmsFryDeliveryStatusChanges`.
3. **Stocking** starts a **production cycle** (`FpmsProductionCycles`) and one **batch** per pond (`FpmsPondBatches`).
4. Every day the batch gets **feedings** (`FpmsFeedingSessions`, drawing feed from `FpmsInventoryLots` through
   `FpmsStockMovements`) and **log entries** (`FpmsProductionLogs` with details such as `FpmsWaterQualityMeasurements`).
5. **Harvests** (`FpmsHarvests`) record kilograms per size grade (`FpmsHarvestGradeLines`) and get a lot code.
6. **Sales** (`FpmsSales`, `FpmsSaleLines`) sell those grade lines to buyers, with payments.
7. The batch and the cycle are **closed**; their records become read-only.

Figures such as FCR, survival, day of culture or pond status are **worked out when read**, never stored, so they can
never disagree with the records. The full list of tables and columns is in [database.md](database.md) and the schema
files `docs/schema.dbml` (dbdiagram.io).

---

## 9. Where it runs

| | Development | Production (farm PC) |
|---|---|---|
| Where | GitHub Codespace or a dev container | The farm-office PC (Windows or Ubuntu) |
| Database | SQL Server 2022 in Docker, `FPMS_Simple` (sample farm) or `FPMS` | SQL Server Express, `CapstoneDb` |
| Started by | `bash .devcontainer/start-fpms.sh` | The API as a service; `Capstone.Migrator` on install and upgrade |
| Web app | `ng serve` on port 4200 | Built files served by the API |
| Secrets | Generated into `.devcontainer/local.env` | Environment variables on the PC (see [API and keys](api-and-keys.md#6-keys-and-secrets)) |
| Swagger (API explorer) | On, `/swagger` | Off |

Day-to-day operation (backups, certificate renewal, alerts, release and rollback) is in [runbook.md](runbook.md).

---

## 10. Words used in this project

| Word | Meaning |
|---|---|
| Farm / tenant | One farm. ABP calls it a tenant; every farm row has `TenantId`. |
| Farm code | The short name typed at sign-in to pick the farm (`TenancyName`). |
| Cycle | One stocking of one fry delivery into one or more ponds. |
| Batch | One pond's share of a cycle, from stocking to closing. |
| ABW, FCR, DOC | Average body weight, feed conversion ratio, day of culture. |
| Request ID | A random ID a form makes for a new entry, so sending it twice never saves it twice. |
| Row version | A number SQL Server changes on every update, so a stale correction is refused. |
| DEC-nn | A recorded decision in `decisions.md`. |
