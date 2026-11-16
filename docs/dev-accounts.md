# Development accounts

In a Codespace the development database is `FPMS_Simple`, which holds the sample farm below (the default; `SEED_SAMPLE_DATA=0` starts the clean `FPMS` database instead, and `SEED_SAMPLE_DATA=logbook` the `FPMS_Logbook` database below). The `admin` password is your `ADMIN_INITIAL_PASSWORD` secret. Never use these accounts in a shared or production environment; the farm's System Administrator password comes from `SystemAdmin:InitialPassword` there.

| Farm code | Username | Role | Password |
| :---- | :---- | :---- | :---- |
| (blank) | `admin` | System Administrator | your `ADMIN_INITIAL_PASSWORD` secret |

The older `pilot-farm` and `test-farm-b` development farms are gone from the app; they now exist only as a test fixture (`aspnet-core/test/Capstone.Tests/TestData`).

## Codespace sample database (FPMS_Simple)

Started by default with `bash .devcontainer/start-fpms.sh`. One small test farm, all passwords `Fpms@2026`. Built by `SimpleSampleDataBuilder`; fixed dates.

| Farm code | User | Role |
|---|---|---|
| `rkabubba-aqua` | `arkabubba` (Abi Rkabubba) | Farm Owner |
| `rkabubba-aqua` | `samsedel` (Sam Amsedel) | Farm Owner |
| `rkabubba-aqua` | `konacsus` (Kim Onacsus) | Farm Technician |

Rkabubba Aqua Farm (test), Barangay Tambler, General Santos City; farming system Intensive. Three ponds, one per construction type, each stocked inside its intensive density band: EP-01 earthen 2,000 m² at 85 PL/m², CP-01 concrete 600 m² at 130 PL/m², HP-01 HDPE-lined 1,000 m² at 130 PL/m² (inside the PNS/BAFS 197:2025 intensive bands, 70–90 earthen and 100–140 lined).

One finished 75-day cycle, `2026-02-GSH-01`, with CP fry from Gensan Shrimp Hatchery (Charoen Pokphand Foods Philippines Corporation, Brgy. Tinoto, Maasim) at ₱0.36 per piece, the CP price quoted in the farm interviews: ponds prepared 20 to 30 Jan 2026, stocked 2 Feb, daily AM and PM feeding, weekly water quality, growth samples every 14 days, probiotic every 14 days and two mortality entries, plus two problems farmers named in the interviews: a power interruption on DOC 40 (aerators off, DO 2.8 at dawn, a mortality entry) and heavy rain on DOC 52 (PM feeding skipped, salinity down to 11 ppt). Total harvest on 18 Apr (DOC 75, about 16 g, graded 60/70 and 50/60); the 60/70 from EP-01 and CP-01 went to the local processing plant (re-weighed, paid in 7 days), the 60/70 from HP-01 to a Manila buyer (closed van to Makar Wharf, then ferry; paid in 10 days), and the 50/60 to a market buyer for cash. Ponds cleaned and left to dry, batches closed 28 Apr, cycle closed 30 Apr. The ponds stood idle through the lean season, May to June. Hatcheries: the three BFAR-accredited P. vannamei hatcheries of Region XII, from the BFAR list as of 30 Nov 2025, with their accreditation numbers and expiry dates (recorded as certificates): Gensan Shrimp Hatchery (CP) `HA01-R12SAR-02092013-RNW101725` and Sto. Niño Aquaculture Corporation `HA02-R12SAR-02092013-RNW101725`, both to 17 Oct 2028, and RDEX Food International Philippines, Inc. (Bawing, General Santos) `HA03-R12-GSC-080718-RNW111521`, to 15 Aug 2027. Permits on file, all current: BFAR fishpond registration, BFAR GAqP farm certification, Mayor's permit, barangay clearance, ECC and BIR registration (test numbers).

A second cycle is running: `2026-09-SNA-01`, with fry from Sto. Niño Aquaculture Corporation (Brgy. Tuyan, Malapatan) at ₱0.33 per piece, its SFSC paper not yet in (no SFSC number on the delivery, so the DEC-79 warnings show at Close Batch, on the trace report and on a sale; type the number on the fry delivery to clear them), ponds prepared 1 to 11 Sep 2026 and stocked 14 Sep 2026, with the day-75 harvest planned for 28 Nov 2026 (before the December to January peak). Its logs run to the day before the database is seeded (at most DOC 74), so the dashboard looks current; seeded after 28 Nov it stops at DOC 74, waiting for the harvest. All three ponds show In production.

Ready to try "Stock a batch": two newer ponds, EP-02 (earthen, 2,000 m²) and HP-02 (HDPE-lined, 1,000 m²), are prepared and marked Prepared, and a fry delivery of 303,000 PL from RDEX Food International Philippines, Inc. (lot `RDX-Bmmdd`) is Received on the seed date and not stocked yet. About 170,000 PL for EP-02 and 130,000 for HP-02 keep both inside the intensive bands. Its Shrimp Fry Source Certificate number is blank, so stocking shows the DEC-79 warning; type it on the delivery first to see the warning go away.

## Logbook sample database (FPMS_Logbook)

Started with `SEED_SAMPLE_DATA=logbook bash .devcontainer/start-fpms.sh` (or the migrator's `--logbook`, or `Seed:LogbookSampleData=true`). One farm and one pond, run the way the partner farm's paper grow-out logbook shows it, so screens can be tried on data shaped like the farm's own. All passwords `Fpms@2026`. Built by `LogbookSampleDataBuilder`.

| Farm code | User | Role |
|---|---|---|
| `logbook-farm` | `ndalisay` (Nena Dalisay) | Farm Owner |
| `logbook-farm` | `jmarasigan` (Jun Marasigan) | Farm Technician |

Dalisay Shrimp Farm (test), Tambler, General Santos City; Intensive; water tested a few times a week; sold ungraded. One earthen pond, EP-01, 1,500 m².

**Cycle `2026-03-GSH-01`, from the logbook (closed).** Stocked 18 Mar 2026: 100,000 PL on the papers, 117,810 counted (3,570 a bag × 33 bags), 78.5 PL/m². Four feedings a day (6 AM, 10 AM, 2 PM, 6 PM) with the kilograms written in the logbook for DOC 0 to 60 (0.5 kg a feeding at the start, 15 kg by DOC 59; 1,662 kg). Feed drawn from the sacks the logbook lists, in order: N310 2 × 10 kg, N311 5 × 10, N312 20 × 10, N313 25 + 4 × 20, N314 30 + 4 × 20, N315 40 + 17 + 13 × 20 (2,930 kg); the codes then change at DOC 7, 14, 30, 46 and 58. ABW typed as the remarks write it: 3.1 g (DOC 28), 4.1, 6.5, 9.1, 11.7, 14.9 and 17.4 g (DOC 72); survival 87% from the survival net. Feeding-tray remarks on the 6 PM feeding; one water change (DOC 43, "CW"). Losses from the back page: 556 taken out for a DOST test (23 Apr), shrimp jumping out at the dike after disturbances (28, 43, 7) and 35, 39 and 15 collected later; 723 in all. Total harvest 13 Jun 2026 (DOC 87), 2,027 kg at 19.4 g, ungraded, weighed by the buyer and sold to one buyer at the tally sheet's terms (₱210 at 10 g plus ₱5 a gram: ₱257/kg), cash. Feed 2,922 kg, FCR 1.44, survival 88.7%.

What the logbook does not give, and how the seed settles it:
- Pond area: not written; 1,500 m² keeps the density inside the intensive earthen band.
- Feed after DOC 60: blank in the logbook. The arrow is continued at 15 kg a feeding from the sacks bought, which run out at DOC 81 (8 kg left, written off at close); DOC 82 to 86 stay blank.
- Harvest: the logbook reads "2,827 kg total sold" with the 8 written over another digit. 2,827 kg at 19.4 g is about 145,700 shrimp, more than the 117,810 counted; 2,027 kg fits the fry count, the 87% survival and the 19.4 g on the cover, so the seed uses it and the harvest's quality note says so. Change `HarvestKg` in the builder if the farm confirms otherwise.
- Fry mash is not in the logbook's feed list, so the first days draw on N310. Feed costs, certificate numbers and names are test values.

**Cycle `2026-09-GSH-01`, running.** The same pond prepared 8 to 24 Sep and restocked 26 Sep 2026 (119,130 counted against 100,000 on the papers), logged the same way up to the day before the database is seeded: the logbook's feeding table, typed ABW weekly from DOC 28 (survival 85% from the net), tray remarks, one rainy evening Not fed (DOC 33), 31 shrimp jumping out (DOC 41), water tested Monday, Wednesday and Friday at dawn and about a fifth changed every two days from DOC 30. The afternoon feedings of the last day are not entered yet, so Catch up on entry has something to show. Feed is bought two days before each sack is needed, as in cycle 1.

No permits are on file, so the dashboard reminds the Owner of the required BFAR certification.

 (development only)

The sign-in page shows one-click buttons for the accounts above when the app runs from `ng serve` / `yarn start` (the development environment). The list is in `angular/src/environments/environment.ts` (`devAccounts`); `environment.prod.ts` leaves it empty, so production builds show no buttons and contain no passwords. A button fills the farm code, username and password and signs in. Only the accounts seeded in the database you are running will work, and `admin` in a Codespace uses your `ADMIN_INITIAL_PASSWORD` secret, so its button only works where the password is still `Fpms@2026`.
