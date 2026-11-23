# Reliability: simultaneous work, lost connections and failures

How the Farm Production Management System (FPMS) behaves when several people work at once, when a connection drops, and
when something fails on the farm PC; where each behaviour is in the code; and which automated test proves it.

Release 1.0.0 and later. Decisions: DEC-37, DEC-38, DEC-127, DEC-131, DEC-132, DEC-133, DEC-134, DEC-135 (in [`decisions.md`](../decisions.md)).

> **Development copy.** In this repository, read-committed snapshot is set by `.devcontainer/start-fpms.sh` rather than a
> committed migration. The SQL Server concurrency tests run in CI job `sqlserver`. Release-only items of DEC-132 (committed
> migrations, the migration CI job, the admin-password check, INFO logging and the FULL recovery model set by migration)
> are not part of this development branch.

## Contents
1. [The approach in one page](#1-the-approach-in-one-page)
2. [Several people saving at the same time](#2-several-people-saving-at-the-same-time)
3. [A save sent twice (double tap, retry, lost connection)](#3-a-save-sent-twice-double-tap-retry-lost-connection)
4. [Two people correcting the same record](#4-two-people-correcting-the-same-record)
5. [Connection lost, sign-in ended, browser closed](#5-connection-lost-sign-in-ended-browser-closed)
6. [Farm PC failures: power, disk, database size, clock](#6-farm-pc-failures-power-disk-database-size-clock)
7. [Upgrades and first start](#7-upgrades-and-first-start)
8. [Known limits](#8-known-limits)
9. [How to check it yourself](#9-how-to-check-it-yourself)

---

## 1. The approach in one page

The farm records feedings, water readings and harvests at the pond edge on shared tablets over the farm's Wi-Fi, with no
Internet. The system is built so that a real-world mistake (a double tap, a dropped connection, two people on the same pond)
never silently loses or duplicates a record. It uses six techniques, each chosen for the kind of record it protects:

| Technique | What it prevents | Used for |
|---|---|---|
| **Uniqueness enforced by the database** | Two records where only one can exist | One feeding per pond, day and feeding number; one open batch per pond; unique codes |
| **Request ID** (idempotency key) | A save sent twice becoming two records | Feedings, log entries, pond preparation, stocking, harvests, sales, tally sheets |
| **Row version** (optimistic concurrency) | A correction from an out-of-date page overwriting someone else's | Cycles, batches, fry deliveries, harvests, sales, log entries, farm profile |
| **Row lock** (pessimistic, where shared state is checked or transitioned) | Two saves both passing a check on the same total or lifecycle state | Stocking from a delivery and cycle; cycle close/reopen; batch reopen coordinated with cycle closure and pond stocking; delivery steps; sales and corrections of a harvest; sales and not-sold entries coordinated with batch closure; harvests, feeding and logs for one batch |
| **Request lock** | A save and its retry arriving at the same moment both getting through | Every save with a request ID (DEC-134) |
| **Atomic database step** | Two saves taking the same number | Cycle codes, dispatch receipt numbers, harvest lot codes |

Every save is one database transaction: it is stored completely or not at all, so a failure never leaves half a record,
and pages read only committed data (READ COMMITTED with read-committed snapshot, so reading never waits for a save).
New pond entries made without a connection are kept on the tablet and sent when it is back (section 5).
Recording is never blocked by a warning (for example feed drawn beyond the stock on hand is saved and the lot flagged);
only impossible or conflicting data is refused, always with a message that says what happened and what to do.

---

## 2. Several people saving at the same time

| Situation | What the person sees | How it works | Where in the code | Test |
|---|---|---|---|---|
| Two technicians record the same feeding (same pond, day, feeding number) | The second save is refused: "Feeding 3 of Nov 17 was already recorded by Tomas Technician at 2:20 PM. Reload the sheet to see it, then correct it if needed." | A unique index allows one feeding per pond, day and number. The sheet tells the server which feedings it showed as empty (`ExpectNew`); if one was saved meanwhile, the server names who saved it instead of overwriting. | `FpmsModelConfiguration.cs` (index on `FeedingSession`: TenantId, BatchId, FeedDate, Session); `FeedingAppService.Save` (the `ExpectNew` check); `feeding-sheet.component.ts` (sends `expectNew`) | `BatchTechnician_Tests.A_feeding_the_other_person_saved_meanwhile_is_named_not_overwritten` |
| Two people stock batches from the same fry delivery at once | The second is refused if together they would stock more PL than were received | The delivery row is locked (`SELECT … WITH (UPDLOCK, ROWLOCK)`) before the PL left is checked, so the two saves run one after the other | `CycleAppService.CreateBatches` (`_rowLocker.LockAsync(RowLockTarget.FryDelivery, …)`); `RowLocker.cs` | `Lifecycle_Tests.AC09_allocations_cannot_exceed_the_pl_received_and_nothing_is_saved` |
| A cycle is closed while someone adds or reopens a batch | Either the batch operation finishes first and cycle closure sees an open batch, or cycle closure finishes first and the batch operation is refused | Adding batches locks the existing cycle before checking Active; cycle close/reopen lock the cycle; batch reopen locks cycle, pond, then batch before checking lifecycle and competing pond batches | `CycleAppService.CreateBatches`, `CycleAppService.Close`, `CycleAppService.Reopen`, `BatchAppService.Reopen`, `RowLocker.cs` | `SqlServerConcurrency_Tests.Cycle_close_and_batch_reopen_are_serialized` |
| Two people stock the same pond | The second is refused | A filtered unique index allows one open batch per pond | `FpmsModelConfiguration.cs` (`UX_FpmsPondBatches_OneOpenBatchPerPond`) | `V26Production_Tests.A_batch_cannot_be_reopened_while_its_pond_has_a_new_open_batch` |
| Two people press the same delivery step (for example Receive fry) at once | The second sees the first step and is refused if it no longer fits ("A delivery that is Received cannot become …") | Each step locks the delivery row before reading its current step | `FryDeliveryAppService.NextStepCheckAsync` and `UndoLastStep` (`_rowLocker.LockAsync`) | Step rules: `Lifecycle_Tests.Delivery_steps_follow_the_flow_and_endings_need_a_reason`; the lock on SQL Server: `SqlServerConcurrency_Tests.A_delivery_step_waits_for_a_step_already_in_progress_then_sees_it` |
| Two saves need the next cycle code, receipt number or lot code | Each gets its own number; none is repeated | One `MERGE … WITH (HOLDLOCK)` statement reads and increments the counter in a single step | `NumberSequenceGenerator.cs` | `ReferenceSetup_Tests.Number_sequence_counts_up_per_scope`; on SQL Server, the sales test above (five different receipt numbers) |
| Two sales of the same harvest at the same moment | Each is checked against what the other sold; a sale that would oversell a grade is refused | The harvest row is locked (in id order, so two sales never wait on each other) before kilograms left are checked; a harvest correction takes the same lock | `SaleAppService.ApplyAsync` and `HarvestAppService.Update` (`RowLocker.LockAsync(RowLockTarget.Harvest, …)`) | `SqlServerConcurrency_Tests.Sales_saved_at_the_same_moment_get_different_receipt_numbers_and_never_oversell` (six 20 kg sales from 100 kg: five saved, one refused) |
| A sale is added, corrected or voided while someone closes its batch | Either the sale change finishes first and closure checks the new balance, or closure finishes first and the sale change is refused; a closed batch cannot become unaccounted again | Sale writes lock all affected harvests then their batches in id order; `RecordDisposal` takes the same harvest-then-batch order; `BatchAppService.Close` holds the batch lock through its persisted accounting check | `SaleAppService.LockAccountingBatchesAsync`, `HarvestAppService.RecordDisposal`, `BatchAppService.Close`, `RowLocker.cs` | `HarvestSales_Tests.A_closed_batch_rejects_sale_creation_correction_and_voiding`; `A_closed_batch_rejects_additional_not_sold_dispositions`; `SqlServerConcurrency_Tests.Batch_closure_and_sale_void_are_serialized_so_accounting_cannot_become_stale` |
| Two people record the final harvest for one batch at the same moment | Only one final harvest is saved; the other sees that the batch is already Harvested | Both submissions lock the batch row before checking its current state or existing final harvest. The same lock is used by corrections, feeding, logs and Close Batch, so an operation cannot slip across the final-harvest or closure transition | `HarvestAppService.Create` and `Update`; `FeedingAppService.Save`; `LogAppService`; `BatchAppService.Close`; `RowLocker.cs` (`RowLockTarget.Batch`) | `SqlServerConcurrency_Tests.Two_final_harvests_saved_at_the_same_moment_can_only_complete_the_batch_once` |
| Feed drawn below the stock on hand (two feedings use the last bags) | Both feedings are saved; the lot is flagged for checking | Recording at the pond is never blocked; the shortfall is a warning and a flag (AC-12) | `InventoryManager.RecordUsageAsync` | `Logbook_Tests.Stock_shortfall_warns_saves_and_flags_the_lot` |
| Several water readings for one pond on one day | All are kept | Allowed on purpose: readings are taken several times a day | `LogAppService.Create` | Logbook tests |
| Reports and lists open while others save | Nobody waits, and nobody sees a save that is not finished | Read-committed snapshot isolation: reading never blocks writing. Every request reads at READ COMMITTED (ABP's default was READ UNCOMMITTED, which could show a save later rolled back; DEC-134). | Migration `DatabaseSettings` (`ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON`); `CapstoneCoreModule.PreInitialize` (`Configuration.UnitOfWork.IsolationLevel`) | `SqlServerConcurrency_Tests.A_report_reads_while_a_save_is_in_progress_without_waiting` |

---

## 3. A save sent twice (double tap, retry, lost connection)

**The risk.** A person taps Save; the server saves; the reply is lost (Wi-Fi drops). The person taps Save again. Without
protection the farm gets a second harvest, or a second sale with its own receipt number.

**The protection.** Every form that creates a record makes one random **request ID** when it opens and keeps it with the
form's draft (so it survives a reload). The server stores the ID with the record; a second save with the same ID returns
the record already saved, with the same lot code or receipt number, instead of making another. If the retry arrives
while the first attempt is still saving, it waits for it (an application lock on the request ID, `IRowLocker.LockRequestAsync`)
and then returns what the first saved (DEC-134). A unique index on the ID refuses a second copy in any case. The Save button
is also disabled while a save is running.

| Record | Server | Form | Test |
|---|---|---|---|
| Feeding | `FeedingAppService.Save` (looks up `ClientRequestId`) | `feeding-sheet.component.ts` | `Logbook_Tests.Resubmitting_the_same_client_request_id_does_not_duplicate` (also checks the feed is drawn from stock once) |
| Log entry (water, growth, mortality, chemical, note, activity) | `LogAppService.Create` | `log-entry.component.ts` | `RetrySafeSaves_Tests.A_retried_log_entry_returns_the_entry_already_saved` |
| Pond preparation entry | `PondAppService` (preparation entries) | `pond-detail.component.ts` | Same pattern; no dedicated test |
| Stocking (one or more batches) | `CycleAppService.CreateBatches` | `stock-batch.component.ts` | `Lifecycle_Tests.AC09_a_retried_submit_does_not_create_twice` |
| Harvest | `HarvestAppService.Create` | `harvest-entry.component.ts` | `RetrySafeSaves_Tests.A_retried_harvest_returns_the_harvest_already_saved` |
| Sale | `SaleAppService.Create` | `sale-entry.component.ts` | `RetrySafeSaves_Tests.A_retried_sale_returns_the_sale_already_saved_with_its_receipt_number` |
| The same harvest sent four times at once (SQL Server) | `HarvestAppService.Create` (request lock) | `harvest-entry.component.ts` | `SqlServerConcurrency_Tests.The_same_harvest_sent_several_times_at_once_is_saved_once`; `The_database_refuses_a_second_record_with_the_same_request_id` |
| The same Final harvest request retried after its first save completed | `HarvestAppService.Create` checks the request ID before the batch's now-Harvested status | `harvest-entry.component.ts` | `SqlServerConcurrency_Tests.Retrying_the_same_final_harvest_request_returns_the_saved_harvest_after_batch_completion` |
| Harvest and sale together (tally sheet) | `TallySheetAppService.Save` (the sale shares the harvest's ID) | `harvest-entry.component.ts` | `HarvestTally_Tests.A_retried_tally_sheet_returns_the_same_harvest_and_sale` |

The double tap itself is stopped in the browser: every save runs through `FpmsPage.act()`
(`angular/src/shared/fpms/fpms-page.ts`), which disables the action while `busy()` is true.

---

## 4. Two people correcting the same record

**The risk.** The Owner opens a harvest to correct it; meanwhile the technician corrects the same harvest; the Owner then
saves. Without protection the Owner's save silently replaces the technician's correction.

**The protection: row versions** (optimistic concurrency). SQL Server stamps a new version on a row each time it changes.
The page receives the version with the record and sends it back with the correction. If the record changed in the
meantime, the versions differ and the save is refused: *"This record was changed by someone else. Refresh the page and try
again."* Nothing is locked while a person is reading or typing, which suits a small farm where real clashes are rare.

| Record | Where the check is |
|---|---|
| Production cycle (close, reopen) | `CycleAppService` |
| Batch (close, reopen) | `BatchAppService` |
| Fry delivery (edit, finish stocking) | `FryDeliveryAppService` |
| Harvest (correction) | `HarvestAppService.Update` |
| Sale (correction) | `SaleAppService.Update` |
| Log entry (correction) | `LogAppService.Update` |
| Farm profile | `FarmProfileAppService.Update` |

All use one helper: `Concurrency.Check` (`aspnet-core/src/Capstone.Application/Production/Concurrency.cs`), with the message
in `FpmsErrors.ConcurrencyConflict` (`Capstone.Core/Domain/FpmsErrors.cs`). The version column is the `[Timestamp]`
`RowVersion` property on each entity.

If two corrections are saved at the very same moment, both pass the page's check; SQL Server then keeps the first, and the
second gets the same message (`CapstoneDbContext.SaveChanges` turns the database's conflict into it; DEC-134).

Tests: `RetrySafeSaves_Tests.A_stale_harvest_or_sale_correction_is_refused`,
`RetrySafeSaves_Tests.A_stale_log_correction_or_farm_profile_save_is_refused`, and on SQL Server
`SqlServerConcurrency_Tests.A_correction_from_a_page_loaded_before_another_save_is_refused` and
`SqlServerConcurrency_Tests.Two_corrections_saved_at_the_same_moment_keep_one_and_refuse_the_other`.

Who may correct what is a separate rule: a technician corrects only their own entries; the Owner may correct any
(`Farm.Logs.EditAny`, `Farm.Harvests.EditAny`). A refused correction names who recorded the entry.

---

## 5. Connection lost, sign-in ended, browser closed

| Situation | What the person sees | How it works | Where in the code |
|---|---|---|---|
| No connection when recording at the pond (new log entry, feeding sheet, pond preparation) | "Kept on this tablet: General note, CP-01 … sent by itself when the connection is back. You can keep recording." The top bar shows "1 to send"; its list shows each kept entry with Send now and Discard. | The entry is kept in the browser's storage (per farm and person, no expiry) and sent oldest first when the app opens, when the connection returns and every 20 seconds. Sending twice is harmless (section 3). An entry the server refuses stays in the list with the reason ("Not accepted: …"), Try again and Discard. DEC-135. | `angular/src/shared/fpms/outbox.ts` (`FpmsOutbox`); `app/layout/header-outbox.component.ts`; callers in `log-entry`, `feeding-sheet`, `pond-detail` |
| No connection for anything else (corrections, harvests, sales, setup) | "Not saved: no connection to the farm server. Check the Wi-Fi, then try again. What you typed is still on this page." | A request with no reply at all (status 0) gets this message; the form stays as it was. Saving again is safe (section 3). Harvests and sales are not kept on the tablet because they give a lot code or receipt number to hand over on the spot. | `angular/src/shared/fpms/http-configuration.service.ts` (`handleNonAbpErrorResponse`) |
| The browser is closed, the tablet restarts or the page reloads mid-entry | On return: "Your unsaved harvest from 2:10 PM was restored", with "Discard it" | Forms save a **draft** on the device as the person types: record operations, feeding sheet, harvest, sale, pond preparation, and (DEC-135) the farm profile and the account form. Drafts are per farm and per user (another person on the same tablet never sees them) and expire after 24 hours. A farm profile draft is restored only if nobody saved the profile since; the account form never keeps a password. | `angular/src/shared/fpms/drafts.ts` (`FormDrafts`); each form calls `FormDrafts.save` |
| The sign-in ends (4 hours) | "Your sign-in has ended. Sign in again to continue…", then the same page reloads; after signing in the person returns to it and the draft brings the entry back | The 4-hour session is deliberate (shared tablets, DEC-37). On an ended session the app reloads the current page, not the home page; sign-in returns to the page it was opened from. | `http-configuration.service.ts` (`handleTargetUrl`); `app-auth.service.ts` (`urlAfterSignIn`); token lifetime in `CapstoneWebCoreModule.cs` (`Authentication:JwtBearer:ExpirationMinutes`, default 240) |
| A user is deactivated or their password reset while signed in | Their next request signs them out | A security-stamp check runs on every request | `Capstone.Core/Identity/SecurityStampValidator.cs` |
| The wrong person is signed in on a shared tablet | The signed-in name is shown in the sidebar; each entry records who saved it | People sign out before handing over a tablet. The "Switch user" button described in DEC-37 is not built yet (section 8). | DEC-37; `sidebar-user-panel.component.html` |

---

## 6. Farm PC failures: power, disk, database size, clock

These are operational risks. The software limits their damage; the farm's routine (see the runbook) does the rest.

| Risk | What protects the data | What the farm must do | Where |
|---|---|---|---|
| Power cut during a save | Each save is a single transaction: stored completely or not at all. SQL Server recovers its log on restart. | Use a UPS on the farm PC; after a power cut, open System health and check the clock. | Database behaviour (ABP unit of work per request) |
| Loss of the PC or its disk | Full and transaction-log backups, an integrity check, an off-site copy, retention and a restore test | Schedule the backup scripts; run the restore test before go-live and after each release. | `scripts/backup/` (`backup.sh`, `backup-log.sh`, `integrity-check.sh`, `offsite-copy.sh`, `retention.sh`, `restore.sh`, `restore-test.sh`; Windows: `scripts/backup/windows/`); recovery model FULL set by migration `DatabaseSettings`; [`docs/backup-restore.md`](backup-restore.md) |
| SQL Server Express reaches 10 GB (it stops accepting data) | The health page warns at 7 GB | Someone owns acting on the warning (archive or upgrade the edition). | `Capstone.Application/Health/HealthEvaluator.cs` (`DatabaseWarnGb`) |
| Disk fills with logs or backups | Application logs are capped at about 300 MB and written at INFO level | Keep the retention script scheduled. | `Capstone.Web.Host/log4net.Production.config`; `scripts/backup/retention.sh` |
| The PC clock is wrong (no Internet to correct it) | Dates are worked out in the farm's time zone from the server clock | Check the clock after power cuts. | `Capstone.Core/Domain/FarmClock.cs`; farm time zone in Farm profile |
| Many tablets at feeding time | Not a concern at the farm's size (a handful of users); reads do not block writes (section 2) | None | — |

---

## 7. Upgrades and first start

| Risk | Protection | Where |
|---|---|---|
| An upgrade loses the farm's records | Database changes are **committed, reviewed migrations** applied in place by the Migrator; nothing is dropped. The build fails if the data model changes without a migration, and CI applies every migration to an empty SQL Server twice. | `aspnet-core/src/Capstone.EntityFrameworkCore/Migrations/`; `.github/workflows/build.yml` (jobs `backend` and `migrations`); runbook "Release and rollback"; DEC-132 |
| The admin account is created with the public development password | Outside development, the first start stops until `SystemAdmin:InitialPassword` is set; that password must be changed at first sign-in | `HostRoleAndUserCreator.InitialAdminPassword`; test `AdminPassword_Tests` |
| Sample (test) data on the farm server | Sample farms are created only in development or when explicitly requested | `SeedOptions`; `CapstoneWebCoreModule.ConfigureSeed`; `CapstoneMigratorModule` |

---

## 8. Known limits

Recorded in DEC-133 to DEC-135 and shown to the farm as they are:

- **Kept entries are on one tablet only** until they are sent. Clearing that browser's data first loses them (the list
  says so). Until they are sent, the Daily record, the figures and other tablets do not show them, and a later entry for
  the same feeding can clash with a kept one (the clash is shown when it is sent).
- **Only new pond entries are kept offline** (log entries, feedings, pond preparation). Corrections, harvests, sales and
  setup still need a connection; the app cannot show data it has not loaded while offline.
- **A refused correction must be redone.** When a correction is refused because the record changed, the person refreshes
  and makes their change again; the system does not merge the two.
- **Inventory items, buyers and users** have no version check: two people editing the same one at the same moment keep the
  later change. These are edited rarely, by the Owner.
- **Forms without a draft** (documents and the setup pages) lose unsaved typing when the sign-in ends.
- **No "Switch user" button yet.** DEC-37 describes one for shared tablets; today people sign out and back in.

---

## 9. How to check it yourself

- **Automated tests:** `cd aspnet-core && dotnet test test/Capstone.Tests/Capstone.Tests.csproj` runs every test named
  in this document. Most run on an in-memory database, which has no transactions, row versions or locks, so the version
  tests there set one first.
- **On real SQL Server (DEC-134):** `SqlServerConcurrency_Tests` (12 tests) run on a real SQL Server when the
  environment variable `FPMS_TEST_SQLSERVER` holds a connection string, for example
  `Server=localhost,1433;User Id=sa;Password=…;TrustServerCertificate=True`. Each test creates its own database from the
  migrations and drops it afterwards; without the variable they are skipped. They show the delivery, harvest and batch lifecycle locks, the
  request lock, row versions, the unique request-ID index, receipt numbers and read-committed snapshot working on the
  database the farm uses. Every push runs them in the GitHub Actions workflow `Build` (`.github/workflows/build.yml`, job
  `sqlserver`), against SQL Server 2022.
- **By hand, two browsers:** sign in as two users on two devices (or a normal and a private window).
  1. Open the same feeding on the feeding sheet in both; save in one, then in the other: the second is refused and names
     the first person.
  2. Open the same harvest for correction in both; save one, then the other: the second is refused as changed by someone else.
  3. On the Sales form, start a sale, switch the Wi-Fi off, press Save: the no-connection message appears and the form is
     unchanged. Switch it on and save: one sale, one receipt number.
  4. Start a harvest, close the browser, open it again: the harvest is restored with "Discard it".
  5. Open Record operations, switch the Wi-Fi off, save a general note: it shows "Kept on this tablet" and the top bar
     "1 to send". Switch the Wi-Fi on: within 20 seconds "1 kept entry sent." and the note is on the Daily record.

## Where to read more

- [`decisions.md`](../decisions.md): DEC-37 (shared-device security), DEC-38 (row locks for cross-row checks), DEC-127
  (two people on one pond), DEC-131 (delivery steps), DEC-132 (release safety), DEC-133 (retry-safe saves and version checks).
- [`docs/runbook.md`](runbook.md): operating the farm PC, releases and rollback.
- [`docs/backup-restore.md`](backup-restore.md): backups and restore.
- [`architecture.md`](../architecture.md): the system's parts and data store.
