# Production Timeline and Harvest Forecast

## Purpose

Give farm users one clear view of each batch's planned and actual lifecycle, its estimated harvest window, and its current harvest-readiness state. Provide a farm-wide calendar for coordinating pond preparation, fry deliveries, stocking, and harvest workload.

This is a product and implementation specification. It does not claim that planned stocking or harvest forecasting is already implemented.

## User-facing experience

### 1. Batch detail: Production timeline

Show a lifecycle timeline near the top of the batch detail page, before the detailed production indicators. Use distinct labels and dates for:

1. **Planned stocking** — an editable target date before the batch is actually stocked.
2. **Actual stocking** — the confirmed stocking event. This remains the source of truth for DOC.
3. **Estimated harvest** — a forecast window, not a commitment or a recorded event.
4. **Harvest readiness** — a live evaluation against the farm's configured DOC and ABW targets and sample-freshness rule.
5. **Actual harvest** — derived from recorded harvest events; show the first/partial harvest activity and final harvest state as appropriate.

Each milestone should show its state (planned, confirmed, forecast, reached, recorded, or unavailable) and a short explanation where needed. Do not use a single generic status to conflate the milestones.

For an unavailable forecast, show **Forecast unavailable** with the reason (for example, insufficient recent growth samples), rather than inventing a date.

### 2. Batches overview

Add an estimated-harvest window and a readable readiness indicator to the Batches table. Keep actual DOC and ABW visible. Ensure the table remains usable at narrow widths; use responsive hiding or a compact secondary line rather than allowing the table to overflow.

Suggested readiness labels:
- Growing
- Approaching target
- Ready for harvest
- Forecast unavailable
- Review needed

The forecast and readiness are separate: a batch may have a projected harvest window while not being ready today.

### 3. Production Calendar

Provide a farm-wide calendar or timeline with:
- Planned stocking events
- Pond preparation milestones
- Fry delivery dates linked to planned stocking
- Active batches and projected harvest windows
- Withdrawal-safe harvest dates
- Actual harvest events

Allow filtering by pond, cycle, and event type. Calendar events should link to their source record.

## Data and business rules

### Planned versus actual stocking

- A planned stocking date is planning data, not a stocking transaction.
- Creating or editing a plan must not create an active PondBatch, consume fry inventory, reserve stock, or start DOC.
- Actual stocking is confirmed through the existing stocking workflow.
- DOC, production indicators, survival estimates, and batch reporting must continue to use the actual stocking date only.
- Preserve both planned and actual dates when plans change or stocking occurs later than planned.
- A planned event should be able to reference a pond and, where appropriate, a cycle and expected fry delivery. Do not assume a fry delivery is confirmed merely because a plan references it.
- Prevent conflicting active plans for the same pond/date where appropriate, but allow an authorized user to resolve or override conflicts with a clear warning.

### Harvest forecast

- Keep estimated harvest date/window separate from the existing `EarliestSafeHarvestDate` and `HarvestReadinessReached` fields.
- Use farm-configured production targets and actual batch history, including DOC and growth-sampling ABW trends, as forecast inputs.
- Prefer a date range over false precision when growth is variable.
- Include the sample date and inputs used, and communicate confidence or the reason a forecast is unavailable.
- Recalculate when relevant growth samples or production records change; do not persist a stale forecast as if it were an observed event.
- Do not forecast from insufficient, stale, or implausible data. Show a reason instead.
- Never let an estimated harvest date override the withdrawal-safe date. If the forecast window precedes the safe date, visibly flag the conflict and show the earliest safe date.
- Forecasting is advisory only. It must not change batch status, mark a batch ready, or block recording a harvest.

### Readiness

Continue using the existing farm standards and readiness rules. Readiness is a current assessment, not a prediction. Keep the sample freshness requirement visible when the DOC target has been reached but no sufficiently recent ABW sample exists.

### Actual harvest

Actual harvest dates and quantities must come from recorded harvest transactions. Do not infer an actual harvest from a forecast or readiness state.

## Suggested implementation sequence

1. **Data model and API:** introduce a planned stocking/schedule record with farm ownership, pond, planned date, optional cycle/fry-delivery references, notes, audit history, and lifecycle state. Keep it distinct from PondBatch and actual stocking.
2. **Planning workflow:** allow authorized users to create, edit, reschedule, cancel, and confirm a plan. Confirmation should hand off to the existing actual stocking workflow; it must not silently create a stocked batch.
3. **Batch detail timeline:** display planned/actual stocking, forecast, readiness, and actual harvest using clearly differentiated states.
4. **Forecast service:** implement a testable projection service with explicit minimum-data, freshness, plausibility, confidence, and safe-date rules. Return an unavailable reason when the data is inadequate.
5. **Batches overview:** add compact forecast and readiness fields.
6. **Production Calendar:** add farm-wide planning and links to source records.
7. **Verification:** cover date/time-zone boundaries, rescheduling, delayed or cancelled plans, partial harvests, missing/stale growth samples, changing farm standards, withdrawal periods, and ensuring plans never affect DOC or production calculations.

## Acceptance criteria

- Editing a planned stocking date never changes actual stocking date or DOC.
- A planned event does not appear as an active production batch and does not affect population, biomass, inventory, or production totals.
- Confirming actual stocking uses the existing validated stocking workflow.
- Users can distinguish planned, actual, estimated, and safe dates without ambiguity.
- Forecasts explain their basis and can explicitly be unavailable.
- Readiness remains a separate current-state evaluation.
- Actual harvest is sourced only from harvest records.
- Calendar and table links open the relevant source record.
- All date calculations respect the farm's configured time zone.
- No change silently makes harvest unavailable or changes existing batch lifecycle rules.
