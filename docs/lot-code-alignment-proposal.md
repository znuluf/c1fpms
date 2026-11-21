# Proposal: lot codes aligned with the Shrimp.io processors

**Status: proposed, not built.** For discussion with the adviser and the Shrimp.io developer. When it is agreed, it
becomes a decision in [decisions.md](../decisions.md) and replaces the format in [harvest-lot-code.md](harvest-lot-code.md)
(DEC-83).

---

## 1. Why change anything

FPMS gives every harvest a lot code at the farm (DEC-83). The Shrimp.io traceability system used by the processors (for
example ECA Cold Store Plus) gives every **processing run** its own lot code when the shrimp are packed. Both codes
describe the same things (year, area, place, farm, pond), but they number them differently. The same pond's shrimp
would carry two unrelated numbers:

| Same pond in Tambler, General Santos | Code |
|---|---|
| FPMS today | `26-0-24-03-07-02` (place **24** = Tambler, farm **03** given by FPMS) |
| Shrimp.io at ECA | `2026` `0` `7` `07` `PP` … (place **7** = Tambler, farm **07** given by ECA) |

In a recall, a buyer or BFAR quotes the processor's code. If FPMS cannot be searched with it, the farm cannot quickly
show which pond, batch, feed and treatments the shrimp came from, which is the whole point of the lot code.

**The goal:** the farm's code and the processor's code read the same where they describe the same thing, and each can be
found from the other.

---

## 2. The two schemes side by side

| Part | FPMS today (DEC-83) | Shrimp.io (`lotCode.ts`, `processingBatches.ts`) |
|---|---|---|
| What it names | One **harvest** at the farm | One **processing run** at a plant |
| When made | When the harvest is saved | When the processing run is created (at packing) |
| Shape | `YY-A-LL-FF-PP-HH` (16 characters) | `YYYYABFFPP-{production code}` (10 digits, a hyphen, the run's code) |
| Year | 2 digits, the harvest's year | 4 digits, the earliest harvest date in the run |
| Area `A` | 0 General Santos, 1 Sarangani | Same ✓ |
| Place | 2 digits, our list of all 26 GenSan barangays and 7 Sarangani municipalities | 1 digit (`B`), coastal places only (`LOT_PLACES`) |
| Farm `FF` | Next free number for the place, given by FPMS | Given by **each processor** to each farm it buys from (`processor_farm_numbers`, one per farm per plant); locked once a run uses it |
| Pond `PP` | `Pond.LotNumber`, farm-wide, never reused | `farm_ponds.pond_no` in Shrimp.io |
| End | Harvest number of the pond in the year (`HH`) | The processor's production code |

The Shrimp.io place list, as sent by their developer (append-only, "a code printed on a carton must keep naming the same
place"):

| Code | Area | Place | | Code | Area | Place |
|---|---|---|---|---|---|---|
| `00` | General Santos | Baluan | | `10` | Sarangani | Alabel |
| `01` | General Santos | Bawing | | `11` | Sarangani | Glan |
| `02` | General Santos | Buayan | | `12` | Sarangani | Kiamba |
| `03` | General Santos | Bula | | `13` | Sarangani | Maasim |
| `04` | General Santos | Calumpang | | `14` | Sarangani | Maitum |
| `05` | General Santos | Labangal | | `15` | Sarangani | Malapatan |
| `06` | General Santos | Siguel | | | | |
| `07` | General Santos | Tambler | | | | |

---

## 3. The proposal

### 3.1 New farm lot code format: `YYYYABFFPP-HH`

The first ten digits are laid out **exactly like the Shrimp.io lot no.**; FPMS adds the harvest number after a hyphen,
where Shrimp.io puts its production code.

| Part | Digits | Meaning | Source in FPMS |
|---|---|---|---|
| `YYYY` | 4 | Year of the harvest (farm time) | The harvest date |
| `A` | 1 | Area: 0 General Santos, 1 Sarangani | The farm's lot place (3.2) |
| `B` | 1 | Place within the area, **from the Shrimp.io list** | The farm's lot place (3.2) |
| `FF` | 2 | The farm's number **as given by its main processor** | Farm profile, typed by the Owner (3.3) |
| `PP` | 2 | The pond's lot number | `Pond.LotNumber`, shown on the pond page (3.4) |
| `HH` | 2 | The pond's harvest number in the year | Counted by FPMS, as today |

**Example.** A farm in Tambler whose number at ECA is 07 harvests pond 12 for the second time in 2026:

```
2026 0 7 07 12 - 02   →   2026070712-02
│    │ │ │  │     └── 2nd harvest of pond 12 in 2026 (FPMS)
│    │ │ │  └──────── pond 12
│    │ │ └─────────── farm no. 07 (given by ECA)
│    │ └───────────── place 7 = Tambler (Shrimp.io list)
│    └─────────────── area 0 = General Santos
└──────────────────── 2026
```

When ECA packs these shrimp, its lot no. begins `2026070712`, the same ten digits. Anyone holding either label can find
the other.

### 3.2 Place: the Shrimp.io list replaces ours

- Farm profile gets a **Lot code location** choice with the Shrimp.io list (General Santos: Baluan … Tambler;
  Sarangani: Alabel … Malapatan), suggested from the farm address and confirmed by the Owner.
- The list is kept in one place in FPMS (`LotPlaces`), with the same codes, and only grows, as Shrimp.io's does.
- A farm whose place is not on the list (an inland barangay, or Malungon) gets no lot code until the place is agreed with
  the processors; its harvests still save, with a notice saying why (as today, "flag, never block").

### 3.3 Farm number: from the processor, not from FPMS

The processor assigns the farm number, and a farm selling to two plants can have two numbers. So FPMS stops inventing it:

| Where | New field | Meaning |
|---|---|---|
| Farm profile | **Farm no. (main processor)** | The number the farm's main processor gave it, 01–99. Used in the farm's own lot code (3.1). |
| Buyer (type processor) | **Our farm no. at this processor** | The number that processor gave the farm, when it differs or there is no main processor. |

Both lock once a lot code uses them, as in Shrimp.io, because codes may already be printed. If the farm has no processor
yet, the Owner enters the number when one is assigned; until then, harvests save without a lot code and the setup
checklist says so.

### 3.4 Pond number: the same on both sides

- The pond page shows **Pond no. for lot codes: 12** next to the pond code (EP-01, CP-01), so the farm gives each
  processor the same number.
- `Pond.LotNumber` stays farm-wide and is never reused, so a pond code that repeats a number across types (EP-01, CP-01)
  never clashes.

### 3.5 Linking to the processor's code

On a sale to a processor:

1. The sale form and dispatch receipt show **"Processor lot no. should begin 2026070712"**, worked out from the
   processor's farm number for that buyer, so the farm can check the processor's label.
2. An optional field **Processor lot code** records the full code from the processor's receipt (for example
   `2026070712-202610261`).
3. The trace report and the Harvests search accept either code: the farm's `2026070712-02` or the processor's
   `2026070712-…`, and lead to the harvest, the pond, the batch, its feed and its treatments.

There is no live connection between the two systems (the farm has no Internet), so the link is made by the matching
digits and by the code typed from the processor's receipt.

---

## 4. What changes in FPMS

| Area | Change |
|---|---|
| Data | `FarmProfile`: lot place code (A, B), main processor farm no. `Buyer`: farm no. at this processor. `Sale`: processor lot code (optional). `Harvest.LotCode` keeps its column, new format. |
| Lot code builder | `HarvestLotCoder` builds `YYYYABFFPP-HH`; `LotPlaces` becomes the Shrimp.io list. |
| Screens | Farm profile (lot location, farm no.), buyer form (farm no. at this processor), pond page (pond no.), sale form and dispatch receipt (expected processor lot no., processor lot code), trace and Harvests search (either code). |
| Codes already given | Codes are never changed once given (DEC-83). In development the sample data is rebuilt; on a farm already using 1.0.0, earlier harvests keep their old codes and new harvests get the new format from the day it is installed, with both searchable. |
| Docs | harvest-lot-code.md rewritten; a new decision; changelog. |

---

## 5. Rules kept from DEC-83

- A code is given when the harvest is saved, and never changes or is reused, even if the harvest's date is corrected.
- Unique per farm; the harvest number never repeats within a pond and year.
- A harvest always saves; a missing piece (place, farm number) is a notice with what to fix, never a block.

---

## 6. Questions before building

**For the Shrimp.io developer**

1. **Bawing and Siguel.** As far as we know, Bawing is part of Barangay Siguel (FPMS lists "Siguel (Bawing)"), but the
   list has Bawing `01` and Siguel `06`. Which does a farm in Bawing use?
2. **Room in the list.** The place is one digit, so an area holds at most 10 places; General Santos already uses 8. What
   happens with a ninth and tenth coastal barangay?
3. **Places not on the list.** Is a farm in an inland barangay or in Malungon out of scope, or will it get a code?
4. **Pond numbers.** Is `PP` the farm's own pond number, so the farm can give the processor the numbers FPMS shows?
5. **What is printed and quoted.** Is the whole `lotNo-productionCode` printed on cartons, and is that what a buyer or
   BFAR quotes in a recall?

**For the adviser**

6. Is a farm-side lot code still wanted when the processor makes its own? (This proposal says yes: it covers harvests
   sold to markets and individuals, which never reach a processor.)
7. Should the farm's code use the **main** processor's farm number, or a number of its own when it sells to several?

---

## 7. Effort

About two to three days: the data fields and migration, the lot code builder and its tests, five screens, the trace
search, and the documents. Nothing else in the system depends on the old format except the lot code itself.
