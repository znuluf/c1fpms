# Comprehensive scenario test database

The Codespace can host a third, isolated SQL Server database named `FPMS_Scenarios`. It is built from the same EF Core model and the app's development sample-data builder, but does not replace or reset `FPMS` or `FPMS_Simple`.

## Create it

Start the Codespace services once (if they are not already running):

```bash
bash .devcontainer/start-fpms.sh
```

Then create the isolated scenario database:

```bash
bash .devcontainer/create-scenario-db.sh
```

The script uses the existing SQL Server container and local development secrets, applies the current EF Core model, and seeds `FPMS_Scenarios`. It does not drop either regular development database. Running it again is safe; the sample builder detects an already-seeded farm and does not duplicate its records.

To rebuild the scenario database from a clean state, the script requires an explicit confirmation naming the database:

```bash
CONFIRM_RESET=FPMS_Scenarios bash .devcontainer/create-scenario-db.sh --reset
```

Only `FPMS_Scenarios` is dropped by that command.

## Sign in

| Farm code | Username | Role | Password |
|---|---|---|---|
| `rkabubba-aqua` | `arkabubba` | Farm Owner | `Fpms@2026` |
| `rkabubba-aqua` | `samsedel` | Farm Owner | `Fpms@2026` |
| `rkabubba-aqua` | `konacsus` | Farm Technician | `Fpms@2026` |
| `rkabubba-aqua` | `filusyam` | Farm Technician | `Fpms@2026` |
| `farmi` | `rafah` | Raf Ah — Farm Owner | `Fpms@2026` |
| `farmi` | `haraff` | Har Aff — Farm Owner | `Fpms@2026` |
| `farmi` | `maysuli` | May Suli — Farm Technician | `Fpms@2026` |
| `farmi` | `yamilus` | Yam Ilus — Farm Technician | `Fpms@2026` |

The System Administrator account is `admin`; its password is the local `ADMIN_PASSWORD` value in `.devcontainer/local.env`.

**Farmi** is a second, separate tenant included for multi-farm and tenant-isolation testing. It has the four accounts above and default farm configuration, but intentionally starts without ponds, cycles, or production records. Its address fields are test placeholders; update them in Farm Settings when testing farm profile details.

## Scenario coverage

The sample is intentionally operational rather than a collection of disconnected rows. It includes linked farms, users, ponds, deliveries, cycles, batches, logs, harvests, sales, inventory movements and traceability.

| Area | Included scenarios |
|---|---|
| Farm and access | Farm Owner and Technician roles; two owners; multiple technicians; batch assignments, shared coverage and temporary cover |
| Farm setup | Intensive farming; earthen, concrete and HDPE-lined grow-out ponds; farm profile, settings, permits and expiring document |
| Pond lifecycle | Available, prepared, stocked and idle ponds; preparation rounds and entries; ponds ready for a new batch |
| Fry deliveries | Ordered, in-transit, received, cancelled and rejected deliveries; shortfalls; delivery with missing SFSC; delivery ready to stock |
| Production cycles | Completed historical cycle and active current cycle |
| Batch monitoring | Stocking, feeding sessions, catch-up gaps, not-fed with a reason, water quality, low dissolved oxygen, growth samples, mortality, chemical/probiotic applications and water exchange |
| Inventory | Feed by growth stage, additive, chemical, lots, receipts, usage movements, reorder levels and treatment withdrawal-period trace warning |
| Harvest | Completed total harvests; partial harvests; crate tally; farm and buyer scales; weighed containers with tare; graded and ungraded harvests; ABW samples; quality observations; not-sold disposal and remaining unaccounted quantity |
| Sales | Multiple buyers; multiple sales from one harvest; crate-to-sale allocation; count-based price; buyer price table; partial payment; cash sale; credit sale; overdue and not-yet-due balances; dispatch and transport details; voided duplicate sale |
| Reports and traceability | Linked harvest/sale/lot/inventory history and realistic production data for cycle, batch, water-quality, feed, sales and trace reports |

The main seed implementation is `SimpleSampleDataBuilder` in `aspnet-core/src/Capstone.EntityFrameworkCore/EntityFrameworkCore/Seed/Development`. Its dates include a finished 75-day production cycle and a running cycle whose logs and partial harvests advance relative to the day the database is seeded.

## Important limits

This is a rich manual-testing dataset, not a substitute for automated tests. It does not claim to represent every invalid input or every permission combination. Use the automated test suite for validation and authorization edge cases. All farm, buyer, supplier, certificate and permit details are synthetic test records; do not use this database for live farm operations.
