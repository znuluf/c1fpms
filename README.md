# Capstone: Farm Production Management System (FPMS)

## What it does
The Farm Production Management System (FPMS, code name Capstone) is an on-premise web application for whiteleg shrimp (*Penaeus vannamei*) production at a partner farm in Sarangani Province and General Santos City, built as a capstone project.

- **Farm Owners** set up ponds, hatcheries, fry deliveries, feed and additives stock, permits and licenses, buyers, and staff. They also close batches and cycles, sell harvests, and review reports.
- **Farm Technicians** record the work at the ponds:
  - pond preparation
  - stocking: one fry delivery is split into batches across Prepared ponds, which starts a production cycle
  - daily logs: AM/PM feeding, water quality checked against GAqP ranges, growth sampling, chemical and supplement application, mortality
  - harvests

It replaces paper logbooks and spreadsheets with one traceable record. It computes density, DOC, ABW, FCR and survival, and tracks permit expiry. It runs on the farm's local network without Internet, and its data model is multi-tenant (FarmId = ABP TenantId), so it can become a cloud SaaS later.

**Full specification:** [docs/Capstone-Planning.md](docs/Capstone-Planning.md) (v2.6). Read it before building any feature.
**References and values:** [docs/references.md](docs/references.md) lists every standard, source document and default value used in the system, for cross-checking.
**Harvest lot code:** [docs/harvest-lot-code.md](docs/harvest-lot-code.md) explains the lot code format (`YY-A-LL-FF-PP-HH`), its place codes and rules (DEC-83).
- `AC-xx`: acceptance criteria (Section 1).
- `DEC-xx`: decisions (decisions.md and Appendix A).
- Validation rules: Section 5, "Data validation and integrity".
- Naming and formatting: Section 2.

## Tech stack
- **Frontend:** Angular 19.2.1 (TypeScript) with abp-ng2-module, zoneless change detection, from the ASP.NET Boilerplate v10.2.0 startup template.
- **Backend:** ASP.NET Core Web API on .NET 9 (`net9.0`) with ASP.NET Boilerplate v10.2.0 (classic ABP, not ASP.NET Zero and not abp.io), EF Core 9. Layered projects:
  - `Capstone.Core`
  - `.Application`
  - `.EntityFrameworkCore`
  - `.Web.Core`
  - `.Web.Host`
  - `.Migrator`
  - `.Tests`
- **Database:** SQL Server. Development (Codespace): SQL Server in Docker, pinned image tag. Production: SQL Server Express. Read-committed snapshot is on.
- **Hosting:** on-premise.
  - Kestrel services on a farm-office PC on a UPS, LAN only.
  - HTTPS with a local certificate authority.
  - API and client on separate origins (DEC-07).
- **Key services:**
  - **Auth:** JWT Bearer (template TokenAuth, 4-hour token, security-stamp check); ASP.NET Core Identity password hashing.
  - **Multi-tenancy:** ABP tenants (one tenant per farm, `IMustHaveTenant`).
  - **Notifications:** the existing farm notification tables, in-app only.
  - **Audit:** ABP audit log and entity history for listed entities.
  - **Background jobs:** ABP periodic workers.
  - **Backups:** `sqlcmd` scripts on Task Scheduler or cron.
  - **Not used:** files and file storage, payments, email, SMS, analytics, external APIs.

## Why this tech stack

The stack was chosen for one situation: **a shrimp farm with no reliable Internet, a small team building a capstone in one
semester, and records (feed, harvests, sales, permits) that must never be lost, duplicated or seen by another farm.**
Every choice below follows from that, and each is recorded as a decision with the options that were turned down
(DEC-01 to DEC-07 in [decisions.md](decisions.md)).

### The choices in one table

| Layer | Chosen | Main reason | Turned down |
|---|---|---|---|
| Where it runs | On a PC at the farm, used over the farm's Wi-Fi (DEC-01) | Works with no Internet; the farm owns its data; no monthly hosting bill | A cloud service (needs Internet the farm lacks, and money); a phone-only app (no shared records) |
| Framework | ASP.NET Boilerplate 10.2 startup template (DEC-04) | Sign-in, roles and permissions, one-database-many-farms, audit log and a layered project come ready and tested | ASP.NET Zero (paid licence); plain ASP.NET Core and Angular (all of that written by hand) |
| Server | ASP.NET Core on .NET 9, C# | Fast, typed, mature, free; one language for rules, data and tests | Node.js/Express, PHP/Laravel or Python/Django (all capable, but sign-in, permissions, many farms in one database and auditing would be assembled from separate libraries instead of coming ready together) |
| Web app | Angular 19 (TypeScript) | Comes with the template, already wired to the server; a complete framework for many forms and tables | React or Vue (would need routing, forms, HTTP and sign-in wiring chosen and built separately) |
| Database | SQL Server: Express on the farm, the same engine in Docker for development (DEC-03) | Free Express edition; transactions, locks and row versions the safe-save rules rely on; the same SQL in development and production | MySQL or PostgreSQL (good, but the template and its migrations target SQL Server); SQLite (one writer at a time, weak for several tablets); MongoDB (the farm's data is relational: ponds, batches, feedings, harvests and sales all point to each other, which tables and foreign keys check for free) |
| Data access | Entity Framework Core with migrations | Tables are defined in C#; every query is parameterised; the farm filter is added to every query automatically | Hand-written SQL everywhere (easy to forget the farm filter, open to SQL injection) |
| Sign-in | JWT tokens, ASP.NET Core Identity password hashing (DEC-02) | Built in and proven; no security code written by hand; works the same if it moves to the cloud | Cookie sessions (extra cross-site protections needed); custom sign-in (high risk) |

### What is great about it, in practice

- **It works without Internet.** Everything (web app, API, database, backups) runs on the farm PC. Tablets need only the
  farm's Wi-Fi, and new pond entries are kept on the tablet and sent later if even that drops (DEC-135).
- **Each farm's data stays its own.** Every farm row carries its farm ID, and ABP adds "this farm only" to every query by
  itself (see [docs/database-queries.md](docs/database-queries.md)). A developer cannot forget it.
- **Security is built in, not hand-made.** Password hashing, account lockout, tokens that expire after 4 hours,
  permission checks on every endpoint, and an audit log of who did what all come from the framework. The team added rules
  on top instead of writing security code.
- **Records cannot be lost or doubled.** SQL Server's transactions, row versions and locks let the system guarantee that a
  save is complete or not at all, that a retried save is not stored twice, and that two people saving at once do not
  overwrite each other. Eight tests prove it on a real SQL Server (see [docs/reliability.md](docs/reliability.md)).
- **Ready to grow into a service.** The same model already supports many farms in one database (DEC-01). Moving to the
  cloud later is a hosting change, not a rewrite.
- **Free to run.** .NET, Angular, ABP's template and SQL Server Express cost nothing; there are no paid services.
- **Easy to check and maintain.** One typed language per side (C# and TypeScript) catches many mistakes before they run;
  about 360 automated tests and a build on every push catch most of the rest. The layered projects keep farm rules
  (`Capstone.Core`) apart from the web and the database.
- **Changes to the database are safe.** Every change is a reviewed migration that upgrades the farm's database in place,
  without losing data (see [docs/database.md](docs/database.md)).

### The trade-offs, honestly

| Trade-off | How it is handled |
|---|---|
| ASP.NET Boilerplate's support ended in May 2026, and .NET 9's on 10 November 2026 (DEC-05) | Versions are pinned and the server stays on the farm's network, never on the Internet. Moving to .NET 10 (supported to 2028) must happen before any Internet-facing deployment. |
| SQL Server Express stops at 10 GB per database | The farm is expected to use under 2 GB in five years; the health page warns at 7 GB. |
| Express has no SQL Agent for scheduled backups | Backups are scripts run by the operating system's scheduler (DEC-36). |
| The farm runs its own server | Backups, HTTPS certificate renewal and updates are in [docs/runbook.md](docs/runbook.md), and the health page alerts when one is late. |
| Angular and ABP take time to learn | The project follows the template's patterns and records its own conventions in [CLAUDE.md](CLAUDE.md) and decisions.md. |

More detail: how the parts fit together is in [docs/system-overview.md](docs/system-overview.md), with diagrams.

## Exact versions (read from the template)
| Component | Version | Source |
| :---- | :---- | :---- |
| ABP packages (`Abp.ZeroCore`, `Abp.AspNetCore`, …) | 10.2.0 | `aspnet-core/src/*/*.csproj` |
| .NET target framework | `net9.0` (SDK 9.0.x) | `*.csproj` |
| EF Core + SQL Server provider | 9.0.5 | `Capstone.EntityFrameworkCore.csproj` |
| JWT bearer | Microsoft.AspNetCore.Authentication.JwtBearer 9.0.5 | `Capstone.Web.Core.csproj` |
| Swashbuckle | 8.1.2 | `Capstone.Web.Host.csproj` |
| Angular | 19.2.1 (zoneless change detection) | `angular/yarn.lock`, `angular/src/main.ts` |
| abp-ng2-module | 12.1.0 | `angular/package.json` |
| TypeScript | 5.8.2 | `angular/package.json` |
| Node.js | 22 LTS (`angular/.nvmrc`); Angular 19 does not support Node 23+ | Angular 19 support matrix |
| Package manager | Yarn 1.22.22 (template ships `yarn.lock`) | `angular/yarn.lock` |
| SQL Server (dev) | `mcr.microsoft.com/mssql/server:2022-CU16-ubuntu-22.04`, Developer edition | `aspnet-core/docker/sqlserver/docker-compose.yml` |

The code namespace and project names are `Capstone.*` (the template was generated as "Capstone"); decision DEC-04.

## Run in GitHub Codespaces
The repository runs entirely in a Codespace (private ports; Docker is used only for SQL Server). Nothing needs installing on your own computer.

1. **Add two Codespaces secrets** (GitHub, Settings, Codespaces, Secrets, allow this repository):
   - `SQL_SA_PASSWORD`: the SQL Server `sa` password (8+ characters with upper case, lower case and a digit).
   - `ADMIN_INITIAL_PASSWORD`: first password of the `admin` System Administrator (changed at first sign-in; same password rules). If a secret is missing, the start script generates a value and keeps it in `.devcontainer/local.env` (git-ignored).
2. **Create the Codespace** from the `main` branch (4 cores, 8 GB, 32 GB). On creation it installs .NET 9, Node 22, `dotnet-ef` and the Angular packages. On every start, `.devcontainer/start-fpms.sh`:
   - starts SQL Server in Docker;
   - generates a brand-new `Initial` migration from the current model (the `Migrations` folder is git-ignored);
   - runs the Migrator, which creates the database, turns on read-committed snapshot and seeds reference data;
   - writes `angular/src/assets/appconfig.json` for the Codespace URLs, then starts the API on port 44311 and the Angular dev server on port 4200 (it proxies `/api`, `/AbpUserConfiguration` and `/signalr`).
3. **Open the ports** from the Ports tab: *Angular app* (4200) is the app; the API (44311) serves Swagger at `/swagger` and health at `/health`.
4. **Sign in:**
   - **System Administrator:** leave the farm code blank, user `admin`, password = `ADMIN_INITIAL_PASSWORD`.
   - **Farm users:** register a farm on the sign-in page, or use the sample farm below.

### Run on your own computer
The same script runs locally: when `CODESPACE_NAME` is not set it uses `https://localhost:44311` (API) and `http://localhost:4200` (app). Install first: .NET 9 SDK, Node 22, Docker, and trust the dev certificate with `dotnet dev-certs https --trust`. Then, from the repository root:
```
(cd angular && yarn install)
bash .devcontainer/start-fpms.sh                          # FPMS_Simple, the sample farm (default)
SEED_SAMPLE_DATA=0 bash .devcontainer/start-fpms.sh       # the clean database
```
Secrets come from the environment (`SQL_SA_PASSWORD`, `ADMIN_INITIAL_PASSWORD`) or are generated into `.devcontainer/local.env`. Opening the folder in a local VS Code Dev Container also works and needs no extra steps.

### Two databases
| Database | When | Content |
| :---- | :---- | :---- |
| `FPMS_Simple` (default, the development database) | `bash .devcontainer/start-fpms.sh` | The `admin` account plus the small `rkabubba-aqua` farm: one closed and one running intensive cycle (see [docs/dev-accounts.md](docs/dev-accounts.md)). |
| `FPMS` | `SEED_SAMPLE_DATA=0 bash .devcontainer/start-fpms.sh` | Clean: the `admin` account and reference data only. |

Both live in the same SQL Server volume. Run the script again with or without `SEED_SAMPLE_DATA=0` to switch. Logs: `/tmp/api.log`, `/tmp/angular.log`, `/tmp/migrator.log`.

If the data model changes after the `Initial` migration was generated, stop the servers, delete `aspnet-core/src/Capstone.EntityFrameworkCore/Migrations`, drop the database (or remove the Docker volume) and run the script again.

## Environment variables
The start script sets these for the Codespace; you normally do not set them yourself. They override `appsettings.json` (use `__` as the section separator).
- `ConnectionStrings__Default`: SQL Server connection string (database `FPMS` or `FPMS_Simple`).
- `Authentication__JwtBearer__SecurityKey`: JWT signing key (generated into `.devcontainer/local.env`).
- `App__ServerRootAddress`, `App__ClientRootAddress`, `App__CorsOrigins`: the Codespace API and app URLs.
- `SystemAdmin__InitialPassword`: first System Administrator password.
- `Seed__SimpleSampleData`: seeds the `rkabubba-aqua` sample farm (on by default in the Codespace; `SEED_SAMPLE_DATA=0` turns it off). Also on in the Development environment unless set to `false`.
- `Audit__RequestRetentionMonths`: request audit retention (default 12).
- Farm-server only (see [docs/runbook.md](docs/runbook.md)): `Backup__FilePrefix`, `Backup__RootPath`, `Backup__OffsitePath`, `Backup__LogIntervalMinutes`, `Backup__RetainDays`, `Backup__RetainWeeks`.

## Main features
- **Accounts:** farm registration with a switch, Farm Owner and Farm Technician accounts, and a System Administrator for setup, reference data, a health page and account recovery.
- **Farm Profile and Settings:** structured address, farming system, permit alert window, date and time display.
- **Ponds first:** ponds must be set up before anything else. Pond status is computed; free-text preparation entries lead to Mark Prepared.
- **Hatcheries:** hatchery profiles and certificates, and fry deliveries with status history (Technicians can update status).
- **Feed and Additives:** lots, receipts, usage and reversing adjustments.
- **Create Batch (Stocking) stepper:** one fry delivery is split across Prepared ponds, with pre-stocking water quality and a review step. The first batch from a delivery starts the production cycle.
- **Operations:** choose the cycle, then the pond. Logs: AM/PM feeding (one or more lots), water quality with GAqP flags and recommendations, growth sampling, chemical and supplement application, mortality.
- **Harvest:** logged from the batch, Partial or Total, with size grades and "Remaining in pond".
- **Sales:** sales to buyers per grade, individual payments, Sales History and a printable dispatch receipt.
- **Closing:** Declare Batch Failure, Close Batch, Close Production Cycle; closed records are read-only.
- **Permits and Licenses:** reference records, renew and archive, expiry reminders.
- **Reports:** six named reports with card summaries, sorting, filters and CSV export.
- **Dashboard:** the setup checklist and the farm's indicators.

## Project structure
- `aspnet-core/src/Capstone.Core/`: entities, domain services, lifecycle rules, `IndicatorCalculator`, `PondSystemRules`, `PermissionNames`, static roles, localization source.
- `aspnet-core/src/Capstone.Application/`: application services and DTOs by subject area (today: Farms, Compliance, Ponds, Resources, Inventory, Production, Logbooks, Harvests, Sales, Finance, Reports, Dashboard, Alerts, ActivityLogs, SystemAdmin; folders are renamed only when their migration step changes them), and background workers.
- `aspnet-core/src/Capstone.EntityFrameworkCore/`: DbContext, entity configurations, seed data (reference data, the `rkabubba-aqua` sample farm, the older development farms used by tests). Migrations are generated per Codespace and not committed.
- `aspnet-core/src/Capstone.Web.Core/`: TokenAuth, security-stamp check, shared web components.
- `aspnet-core/src/Capstone.Web.Host/`: ASP.NET Core host (startup, configuration, `/health`, Swagger in Development).
- `aspnet-core/src/Capstone.Migrator/`: console app that applies migrations and seeds data.
- `aspnet-core/test/Capstone.Tests/`: xUnit tests named `{Method}_{Condition}_{Expected}`, grouped by acceptance criterion.
- `angular/src/app/fpms/`: feature pages per navigation area.
- `angular/src/shared/fpms/`: FPMS API client, page base (zoneless-safe), formatting helpers, shared components (the template's `angular/src/shared/` holds the rest).
- `angular/src/account/`: sign-in with Farm code, farm registration, forced password change.
- `angular/src/assets/`: static assets and `appconfig*.json`.
- `aspnet-core/docker/sqlserver/`: SQL Server compose file (the start script writes its `.env`).
- `.devcontainer/`: Codespace definition and `start-fpms.sh`.
- `scripts/`: farm-server backup, restore and integrity scripts.
- `docs/`: specification, runbook, user guide, development accounts, test report.

## Useful commands
- `bash .devcontainer/start-fpms.sh` (`SEED_SAMPLE_DATA=0` for the clean database): start everything.
- `cd aspnet-core && dotnet test`: run backend tests (they use their own test data, in memory).
- `cd aspnet-core && dotnet format --verify-no-changes`: check C# formatting.
- `cd angular && yarn start`: run the client alone.
- `cd angular && npx ng build --configuration production`: production build of the client.
- `cd angular && npx eslint . && npx prettier --check .`: lint and format check.
- `scripts/backup/`: backup, restore and restore rehearsal for a farm server (see docs/backup-restore.md and docs/runbook.md). Not used in a Codespace.
- [docs/system-overview.md](docs/system-overview.md): how the system works, with diagrams: the parts, what happens on Save, sign-in, working offline, the data.
- [docs/api-and-keys.md](docs/api-and-keys.md): every API endpoint and who may call it, how sign-in and tokens work, and every key and secret: what it protects and where it is set.
- [docs/database-queries.md](docs/database-queries.md): what the reads and writes look like in SQL, captured from SQL Server.
- [docs/database.md](docs/database.md): how the database is defined in code, how a change reaches SQL Server, what was added recently, and how to redraw the ERD.
- [docs/reliability.md](docs/reliability.md): how the system handles several people saving at once, saves sent twice, lost connections, ended sign-ins and farm-PC failures, with the code and tests for each.

## Current status
- **Specification:** at v2.6 (26 Oct 2026): decisions DEC-01 to DEC-68, with DEC-60 rejected and DEC-61 waiting on the partner farm. v2.6 changes are planning only; the code follows later. Every open item is either resolved or marked † for confirmation.
- **Code:** the existing Capstone codebase already implements most P1 features under the earlier spec (fpms.md v1.5, D-01 to D-39). Spec v2.4 is now the target, and it changes the production model, schema, logs, permits, sales and operations.
- **Superseded:** the earlier planning document (fpms.md v1.x) and the old D-xx decision log. The file was removed from `docs/` and stays in git history; their IDs map to DEC-xx in spec Appendix C.
- **Current work:** Milestone 0 gap analysis is done (docs/gap-analysis.md); next is migration step A, Foundations (roadmap.md).
- **Development environment:** GitHub Codespaces only; production remains the on-premise farm server.

**Items to confirm with the adviser or partner farm:**
- water-quality recommendation texts
- retention periods
- thresholds marked † in the spec
- structured pond-preparation fields
- date display order
