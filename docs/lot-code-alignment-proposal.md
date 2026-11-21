# Proposal: linking FPMS lot codes to the Shrimp.io processors' lot codes

**Status: proposed, not built.** For discussion with the adviser and the Shrimp.io developer. When it is agreed, it
becomes a decision in [decisions.md](../decisions.md).

FPMS keeps its own numbering. The farm's [Farm ID](farm-id-proposal.md) and the harvest lot code
([harvest-lot-code.md](harvest-lot-code.md), DEC-83) stay as they are, with FPMS's two-digit place list. This proposal
only adds what is needed to **find a harvest from a processor's lot code**, and the other way round.

---

## 1. Why

FPMS gives every harvest a lot code at the farm. The Shrimp.io system used by the processors (for example ECA Cold Store
Plus) gives every **processing run** its own lot code when the shrimp are packed. The two number places and farms
differently, so the same pond's shrimp carry two unrelated codes:

| Same pond in Tambler, General Santos | Code |
|---|---|
| FPMS (farm) | `26-0-24-03-07-02`: area 0, place **24** = Tambler, farm **03** (FPMS's Farm ID `0-24-03`), pond 7, harvest 2 |
| Shrimp.io (processor) | `2026` `0` `7` `07` `PP` `-` …: area 0, place **7** = Tambler (their list), farm **07** (given by ECA), pond, production code |

In a recall, a buyer or BFAR quotes the processor's code. FPMS must be able to go from that code to the harvest, pond,
batch, feed and treatments.

---

## 2. The two schemes side by side

| Part | FPMS (kept) | Shrimp.io (`lotCode.ts`, `processingBatches.ts`) |
|---|---|---|
| Names | One **harvest** at the farm | One **processing run** at a plant |
| Made | When the harvest is saved | When the processing run is created (at packing) |
| Shape | `YY-A-LL-FF-PP-HH` | `YYYYABFFPP-{production code}` |
| Year | 2 digits, the harvest's year | 4 digits, the earliest harvest in the run |
| Area | `0` General Santos, `1` Sarangani | Same |
| Place | **2 digits**, all 26 GenSan barangays and 7 Sarangani municipalities; Bawing is part of Siguel (`22`) | **1 digit**, coastal places only; Bawing (`1`) and Siguel (`6`) listed separately |
| Farm | FPMS's farm number in the place (Farm ID `A-LL-FF`) | The farm no. each processor gives the farm |
| Pond | `Pond.LotNumber`, farm-wide | The processor's pond no. for the farm |
| End | Harvest number of the pond in the year | The processor's production code |

---

## 3. The proposal

### 3.1 Record the processor's numbers on the buyer

A processor shows the farm a **Lot code location** and a **Farm no.** (ECA's "Lot codes" dialog). The Owner copies them
onto that buyer in FPMS:

| Buyer field (processors only) | Example | Meaning |
|---|---|---|
| Processor's lot code location | `0-7` | Area and place digits the processor uses for this farm |
| Our farm no. at this processor | `07` | The number the processor gave this farm |

Both are optional and can be filled in when the farm first sells to that processor.

### 3.2 The same pond number on both sides

The pond page shows **Pond no. for lot codes: 07** next to the pond code (EP-01, CP-01), so the farm gives each processor
the same pond numbers FPMS uses.

### 3.3 Show the processor's expected lot no. on the sale

On a sale to a processor whose numbers are recorded, each line shows what that processor's lot no. should begin with:

```
FPMS lot code      26-0-24-03-07-02
ECA lot no. from   2026 0 7 07 07   →  2026070707
                   │    │ │ │  └── pond 7 (same pond number)
                   │    │ │ └───── our farm no. at ECA
                   │    │ └─────── ECA's place digit for this farm
                   │    └───────── area
                   └────────────── harvest year
```

It also prints on the dispatch receipt to that buyer, so the processor's staff and the farm can check that the label
matches the shrimp delivered.

### 3.4 Record the processor's full code, and search with either

- The sale gets an optional **Processor lot code** per line, typed from the processor's receipt or label
  (for example `2026070707-202610261`).
- The trace report and the Harvests search accept **either code**: FPMS's `26-0-24-03-07-02`, the processor's full code,
  or just its first ten digits. A processor code leads to the sale lines it was recorded on, and from there to the
  harvest, pond, batch, feed and treatments.

There is no live connection between the two systems (the farm has no Internet), so the link is the numbers the Owner
records and the code typed from the processor's paper.

---

## 4. What changes in FPMS

| Area | Change |
|---|---|
| Data | `Buyer`: processor's lot location (area, place digit), our farm no. at this processor. `SaleLine`: processor lot code (optional). No change to `Harvest.LotCode` or the Farm ID. |
| Screens | Buyer form (two fields, processors only); pond page (pond no. for lot codes); sale form and dispatch receipt (expected processor lot no., processor lot code); trace and Harvests search (either code). |
| Lot codes already given | Unchanged. |
| Docs | harvest-lot-code.md gains a "Processors' codes" section; a new decision; changelog. |

About one to two days, with tests.

---

## 5. Rules kept from DEC-83

- An FPMS lot code is given when the harvest is saved, and never changes or is reused.
- A harvest and a sale always save; a missing processor number or code is a notice, never a block.

---

## 6. Questions

**For the Shrimp.io developer**

1. **Bawing and Siguel.** Bawing is part of Barangay Siguel, but your list has Bawing `01` and Siguel `06`. Which should a
   farm in Siguel (including Bawing) use? One code for both would match the barangay.
2. **One farm no. per farm, or per plant?** Your screen says the location and farm no. "apply to every customer". Does a
   farm keep the same farm no. at every plant?
3. **Pond numbers.** Is `PP` the farm's own pond number, so the farm can give you the numbers FPMS shows?
4. **What is quoted in a recall.** The whole `lotNo-productionCode`, or the lot no. only?

**For the adviser**

5. Is it enough to link the processor's code to FPMS's (this proposal), or should FPMS print the processor's numbers on
   its own lot code as well?
