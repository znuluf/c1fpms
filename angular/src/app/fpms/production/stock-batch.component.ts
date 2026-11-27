import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime, newGuid } from '@shared/fpms/farm-time';
import { WizardSteps } from '@shared/fpms/wizard-steps';
import { joinNames } from '@shared/fpms/labels';
import { FPMS_IMPORTS } from '../shared-imports';
import { optimalState } from './water-quality';

interface Allocation {
    pond: any;
    selected: boolean;
    plCount: number | null;
    stockedAt: string;
    acclimationMinutes: number | null;
    technicianUserIds: number[];
    initialSurvivalEstimatePct: number | null;
    deadAtStocking: number | null;
    targetHarvestAbwG: number | null;
    maxCultureDays: number;
    readings: Record<string, number | null>;
}

/**
 * Create Batch (Stocking), one continuous stepper (Refs 5.1–5.3; AC-08 to AC-10):
 * Fry source → Ponds → Batch details (with pre-stocking water quality) → Review → Create.
 * Entered data is kept when moving back. Nothing is saved until Create.
 */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <div class="fpms-dialog-backdrop">
            <div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="cb-h">
                <div class="fpms-dialog-head">
                    <div class="flex-fill">
                        <h1 id="cb-h">{{ cycleCode ? 'Stock a batch · ' + cycleCode : 'Stock a batch' }}</h1>
                        <p class="text-muted mb-0">Stock fry from one delivery into prepared ponds. Nothing is saved until the last step.</p>
                    </div>
                    <a class="fpms-dialog-close" [routerLink]="closeLink" aria-label="Close" title="Close">&times;</a>
                </div>
                <div class="fpms-dialog-body">
                <ol class="fpms-steps fpms-stepper mb-4" aria-label="Progress">
                    @for (s of stepNames; track $index) {
                        <li [class.active]="step === $index" [class.done]="step > $index" [attr.aria-current]="step === $index ? 'step' : null">
                            <span class="n">
                                @if (step > $index) { <i class="fas fa-check" aria-hidden="true"></i><span class="sr-only">Done:</span> } @else { {{ $index + 1 }} }
                            </span>
                            <span class="t">{{ s }}</span>
                        </li>
                    }
                </ol>
                @if (!options) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @switch (step) {
                        @case (0) {
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Fry source</h3></div>
                                <div class="card-body">
                                    @if (!options.deliveries.length) {
                                        <fpms-empty text="No Received fry delivery is waiting to be stocked. Record a delivery and set its status to Received first." icon="fas fa-truck">
                                            @if (can('Farm.FryDeliveries')) {
                                                <a routerLink="/app/resources/fry-deliveries" class="btn btn-sm btn-primary">Go to fry deliveries</a>
                                            }
                                        </fpms-empty>
                                    }
                                    @if (options.deliveries.length) {
                                        <p class="text-muted">Newest first. Choose the delivery you are stocking from; you can enter the record on any day.</p>
                                    }
                                    <!-- Each delivery as a tile: what it is, then how much is left to stock (DEC-114). -->
                                    <div class="fpms-choices" role="radiogroup" aria-label="Fry delivery">
                                        @for (d of shownDeliveries; track d.id) {
                                            <div class="custom-control custom-radio fpms-choice">
                                                <input type="radio" class="custom-control-input" [id]="'d' + d.id" name="delivery" [value]="d.id" [(ngModel)]="deliveryId" [disabled]="!!cycleId" />
                                                <label class="custom-control-label" [for]="'d' + d.id">
                                                    <span class="fpms-choice-title">{{ d.hatcheryBatchNumber }} <span class="badge badge-info ml-1">{{ ago(d.daysSinceReceived) }}</span></span>
                                                    <span class="d-block">{{ d.hatcheryName }} <span class="fpms-pond-tag">{{ d.hatcheryShortCode }}</span> · received {{ d.deliveryDate | farmDate }}</span>
                                                    <span class="d-block"><strong>{{ d.plLeft | num: 0 }} PL left</strong> of {{ d.plReceived | num: 0 }} · {{ d.plAgeDays != null ? 'PL' + d.plAgeDays : 'PL age not recorded' }}</span>
                                                    <span class="d-block text-muted">{{ d.plHealthCertificateNo ? 'PL health certificate ' + d.plHealthCertificateNo : 'No PL health certificate recorded' }}</span>
                                                </label>
                                            </div>
                                        }
                                    </div>
                                </div>
                                <div class="card-footer fpms-wizard-foot">
                                    <button class="btn btn-primary" [disabled]="!delivery" (click)="go(1)">Next: ponds</button>
                                </div>
                            </div>
                        }
                        @case (1) {
                            <div class="card">
                                <div class="card-header d-flex align-items-center">
                                    <h3 class="card-title mr-auto">Ponds and PL allocation</h3>
                                    <span [class.text-danger]="remaining < 0">Remaining: <strong>{{ remaining | num: 0 }}</strong> of {{ delivery.plLeft | num: 0 }} PL</span>
                                </div>
                                <div class="card-body p-0 table-responsive">
                                    @if (!allocations.length) {
                                        <fpms-empty text="No pond is marked Prepared. Record its preparation and select Mark Prepared on the pond page." icon="fas fa-water">
                                            <a routerLink="/app/ponds" class="btn btn-sm btn-primary">Go to ponds</a>
                                        </fpms-empty>
                                    } @else {
                                        <!-- Four columns: the pond with its size, system and preparation; the count; the density against its band (DEC-114). -->
                                        <table class="table mb-0">
                                            <thead><tr><th>Pond</th><th>Prepared</th><th style="width: 10rem">Stocking count (PL)</th><th class="text-right" style="width: 13rem">Density</th></tr></thead>
                                            <tbody>
                                                @for (a of allocations; track a.pond.id) {
                                                    <tr [class.table-active]="a.selected">
                                                        <td>
                                                            <div class="custom-control custom-checkbox">
                                                                <input type="checkbox" class="custom-control-input" [id]="'al' + a.pond.id" [(ngModel)]="a.selected" />
                                                                <label class="custom-control-label" [for]="'al' + a.pond.id"><span class="fpms-pond-tag">{{ a.pond.pondCode }}</span> {{ a.pond.name }}</label>
                                                            </div>
                                                            <div class="text-muted">{{ a.pond.areaM2 | num: 0 }} m² · {{ a.pond.farmingSystem | label: L.FarmingSystems }}</div>
                                                        </td>
                                                        <td>{{ a.pond.preparedAtUtc | farmDateTime }}</td>
                                                        <td><input type="number" min="1" step="1" class="form-control" [(ngModel)]="a.plCount" [disabled]="!a.selected" [attr.aria-label]="'PL for ' + a.pond.pondCode" /></td>
                                                        <td class="text-right">
                                                            @if (a.selected && a.plCount) {
                                                                <span class="text-nowrap" [class.text-warning-dark]="densityState(a) !== 'within'" [class.font-weight-bold]="densityState(a) !== 'within'">{{ a.plCount / a.pond.areaM2 | num: 1 }} PL/m²@if (densityState(a) !== 'within') { <i class="fas fa-exclamation-triangle ml-1" aria-hidden="true"></i> }</span>
                                                                @if (densityState(a) !== 'within') {
                                                                    <div class="text-warning-dark text-wrap">{{ densityState(a) === 'above' ? 'Above' : 'Below' }} the {{ bandText(a.pond) }}</div>
                                                                    <div class="text-muted text-wrap">You can still save.</div>
                                                                } @else {
                                                                    <div class="text-muted text-wrap">{{ bandText(a.pond) }}</div>
                                                                }
                                                            } @else {
                                                                <span class="text-muted">—</span>
                                                                <div class="text-muted text-wrap">{{ bandText(a.pond) }}</div>
                                                            }
                                                        </td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    }
                                </div>
                                @if (options.blockedPonds.length) {
                                    <div class="card-body border-top">
                                        <strong>Prepared but not available:</strong>
                                        <ul class="mb-0">
                                            @for (p of options.blockedPonds; track p.id) {
                                                <li>{{ p.pondCode }}: {{ p.blockedReason }}</li>
                                            }
                                        </ul>
                                    </div>
                                }
                                <div class="card-footer fpms-wizard-foot">
                                    <button class="btn btn-default" (click)="go(0)">Back</button>
                                    <button class="btn btn-primary" [disabled]="!selected.length || remaining < 0 || selected.some(badCount)" (click)="go(2)">Next: batch details</button>
                                    @if (remaining < 0) { <span class="text-danger small ml-2">The allocations exceed the PL left in this delivery.</span> }
                                </div>
                            </div>
                        }
                        @case (2) {
                            @for (a of selected; track a.pond.id; let first = $first) {
                                <div class="card">
                                    <div class="card-header d-flex align-items-center">
                                        <h3 class="card-title mr-auto">{{ a.pond.pondCode }} · {{ a.plCount | num: 0 }} PL · {{ a.plCount / a.pond.areaM2 | num: 1 }} PL/m²</h3>
                                        <span class="text-muted">{{ a.pond.areaM2 | num: 0 }} m² · avg depth {{ a.pond.averageDepthM | num: 2 }} m · {{ a.pond.farmingSystem | label: L.FarmingSystems }}</span>
                                        @if (!first) {
                                            <button class="btn btn-xs btn-outline-secondary ml-2" (click)="copyFromFirst(a)">Copy from {{ selected[0].pond.pondCode }}</button>
                                        }
                                    </div>
                                    <div class="card-body">
                                        <h4 class="fpms-section-h mt-3">Harvest targets</h4>
                                        <p class="small text-muted">Set the target shrimp weight and maximum culture duration for this batch. The maximum DOC is a limit, not a required waiting period.</p>
                                        <div class="form-row">
                                            <div class="form-group col-md-6">
                                                <label [for]="'ta' + a.pond.id">Target harvest ABW (g)</label>
                                                <input [id]="'ta' + a.pond.id" type="number" min="0.1" max="60" step="0.1" class="form-control" [(ngModel)]="a.targetHarvestAbwG" />
                                                <small class="form-text text-muted">{{ options.defaultHarvestTargetAbwG != null ? 'Farm default: ' + options.defaultHarvestTargetAbwG + ' g. Change for this batch if needed.' : 'No farm default set. Enter a target for this batch, or leave blank if not yet decided.' }}</small>
                                            </div>
                                            <div class="form-group col-md-6">
                                                <label [for]="'mc' + a.pond.id">Maximum culture duration (DOC)</label>
                                                <div class="input-group">
                                                    <input [id]="'mc' + a.pond.id" type="number" min="1" max="180" step="1" class="form-control" [(ngModel)]="a.maxCultureDays" required />
                                                    <div class="input-group-append"><span class="input-group-text">days</span></div>
                                                </div>
                                                <small class="form-text text-muted">Farm default: {{ options.defaultMaxCultureDays }} days. This does not prevent earlier harvest when target ABW is reached.</small>
                                            </div>
                                        </div>
                                        <div class="form-row">
                                            <div class="form-group col-md-6">
                                                <label [for]="'sa' + a.pond.id">Stocking date and time <span class="text-danger">*</span></label>
                                                <input [id]="'sa' + a.pond.id" type="datetime-local" class="form-control" [(ngModel)]="a.stockedAt" [min]="windowMin" [max]="windowMax" required />
                                                <small class="form-text" [class.text-danger]="!inWindow(a)" [class.text-muted]="inWindow(a)">
                                                    From {{ delivery.deliveryDate | farmDate }} (received) to now.
                                                </small>
                                            </div>
                                            @if (people.length) {
                                                <fieldset class="form-group col-md-6" role="group" [attr.aria-labelledby]="'tu' + a.pond.id">
                                                    <legend [id]="'tu' + a.pond.id" class="fpms-group-label">Looked after by</legend>
                                                    <div class="fpms-people">
                                                        @for (p of people; track p.id) {
                                                            <div class="custom-control custom-checkbox">
                                                                <input type="checkbox" class="custom-control-input" [id]="'tu' + a.pond.id + '-' + p.id" [checked]="a.technicianUserIds.includes(p.id)" (change)="toggleTech(a, p.id)"
                                                                    [disabled]="!a.technicianUserIds.includes(p.id) && a.technicianUserIds.length >= 4" />
                                                                <label class="custom-control-label" [for]="'tu' + a.pond.id + '-' + p.id">{{ p.name }}</label>
                                                            </div>
                                                        }
                                                    </div>
                                                    <small class="form-text text-muted">One person, or two who share the pond. You can change it, or add a cover, on the batch page.</small>
                                                </fieldset>
                                            } @else if (!can('Farm.Production.Manage')) {
                                                <div class="form-group col-md-6">
                                                    <span class="fpms-group-label">Looked after by</span>
                                                    <p class="mb-0"><i class="fas fa-user mr-1" aria-hidden="true"></i>You. The pond is added to My pond; the Farm Owner can name someone else.</p>
                                                </div>
                                            }
                                        </div>
                                        <h4 class="fpms-section-h mt-3">Pond water before stocking</h4>
                                        <div class="form-row">
                                            @for (p of stockingParams; track p.code) {
                                                <div class="form-group col-6 col-md-3">
                                                    <label [for]="'wq' + p.code + a.pond.id">{{ p.name }} <span class="text-danger">*</span></label>
                                                    <div class="input-group">
                                                        <input [id]="'wq' + p.code + a.pond.id" type="number" step="any" class="form-control" [(ngModel)]="a.readings[p.code]" required [min]="p.physicalMin" [max]="p.physicalMax" />
                                                        <div class="input-group-append"><span class="input-group-text">{{ p.unitCode }}</span></div>
                                                    </div>
                                                    <small class="form-text" [class.text-muted]="state(p, a) === 'ok' || state(p, a) === 'empty'" [class.text-warning-dark]="state(p, a) === 'out'" [class.text-danger]="state(p, a) === 'invalid'">
                                                        @switch (state(p, a)) {
                                                            @case ('out') { <i class="fas fa-exclamation-triangle mr-1"></i>Outside {{ p.optimalRange }}; saved and flagged. {{ advice(p, a) }} }
                                                            @case ('invalid') { Not physically possible ({{ p.physicalMin }}–{{ p.physicalMax }}). }
                                                            @default { Optimal {{ p.optimalRange }} }
                                                        }
                                                    </small>
                                                </div>
                                            }
                                        </div>
                                        <details class="fpms-fold" [open]="a.acclimationMinutes != null || a.initialSurvivalEstimatePct != null || a.deadAtStocking != null">
                                            <summary>More details <span class="fpms-fold-hint">acclimation, survival estimate, dead at stocking</span></summary>
                                            <div class="form-row">
                                                <div class="form-group col-md-6">
                                                    <label [for]="'ac' + a.pond.id">Acclimation (minutes)</label>
                                                    <input [id]="'ac' + a.pond.id" type="number" min="0" max="600" class="form-control" [(ngModel)]="a.acclimationMinutes" />
                                                </div>
                                                <div class="form-group col-md-6">
                                                    <label [for]="'is' + a.pond.id">Initial survival estimate (%)</label>
                                                    <input [id]="'is' + a.pond.id" type="number" min="0" max="100" step="0.1" class="form-control" [(ngModel)]="a.initialSurvivalEstimatePct" />
                                                </div>
                                                <div class="form-group col-md-6">
                                                    <label [for]="'da' + a.pond.id">Dead at stocking (PL)</label>
                                                    <input [id]="'da' + a.pond.id" type="number" min="0" step="1" class="form-control" [(ngModel)]="a.deadAtStocking" />
                                                    <small class="form-text text-muted">Recorded separately; not taken off the stocking count.</small>
                                                    @if (a.deadAtStocking != null && a.plCount && a.deadAtStocking > a.plCount) {
                                                        <small class="form-text text-warning-dark">More than the stocking count. Check both numbers.</small>
                                                    }
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            }
                            <div class="fpms-wizard-foot">
                                <button class="btn btn-default" (click)="go(1)">Back</button>
                                <button class="btn btn-primary" [disabled]="!detailsValid()" (click)="go(3)">Next: review</button>
                                @if (!detailsValid()) { <span class="fpms-wizard-note">Enter a stocking time within the delivery's window and DO, temperature, pH and salinity for every pond.</span> }
                            </div>
                        }
                        @case (3) {
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Review</h3></div>
                                <div class="card-body">
                                    <div class="alert alert-light border mb-3">
                                        <div>
                                            Fry delivery <strong>{{ delivery.hatcheryBatchNumber }}</strong> from {{ delivery.hatcheryName }},
                                            received <strong>{{ delivery.deliveryDate | farmDate }}</strong> ({{ ago(delivery.daysSinceReceived) }}),
                                            {{ delivery.plAgeDays != null ? 'PL' + delivery.plAgeDays : 'PL age not recorded' }}.
                                        </div>
                                        <div class="custom-control custom-checkbox mt-2">
                                            <input type="checkbox" class="custom-control-input" id="confirmDelivery" [(ngModel)]="confirmDelivery" />
                                            <label class="custom-control-label" for="confirmDelivery">These are the fry from this delivery.</label>
                                        </div>
                                    </div>
                                    <p class="mb-2">
                                        @if (cycleCode) { Adds batches to cycle <strong>{{ cycleCode }}</strong>. } @else { Starts a new production cycle (Active); its code is generated when you create it. }
                                    </p>
                                    <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead><tr><th>Pond · stocked</th><th class="text-right">PL · PL/m²</th><th class="text-right">Dead</th><th>DO / Temp / pH / Sal</th></tr></thead>
                                        <tbody>
                                            @for (a of selected; track a.pond.id) {
                                                <tr>
                                                    <td><span class="fpms-pond-tag">{{ a.pond.pondCode }}</span><div class="text-muted text-nowrap">{{ a.stockedAt.replace('T', ' ') }}</div>@if (people.length) { <div class="text-muted">{{ peopleNames(a.technicianUserIds) }}</div> } @else if (!can('Farm.Production.Manage')) { <div class="text-muted">Looked after by you</div> }</td>
                                                    <td class="text-right">
                                                        {{ a.plCount | num: 0 }}
                                                        <div class="text-nowrap" [class.text-muted]="densityState(a) === 'within'" [class.text-warning-dark]="densityState(a) !== 'within'">{{ a.plCount / a.pond.areaM2 | num: 1 }} PL/m²@if (densityState(a) !== 'within') { <i class="fas fa-exclamation-triangle ml-1" aria-hidden="true"></i><span class="sr-only">outside the range</span> }</div>
                                                    </td>
                                                    <td class="text-right">{{ a.deadAtStocking != null ? (a.deadAtStocking | num: 0) : '—' }}</td>
                                                    <td>{{ readingsLine(a) }}</td>
                                                </tr>
                                            }
                                        </tbody>
                                        <tfoot>
                                            <tr><th>Total allocated</th><th class="text-right">{{ allocated | num: 0 }}</th><th colspan="3">PL left after this: {{ remaining | num: 0 }}</th></tr>
                                        </tfoot>
                                    </table>
                                    </div>
                                </div>
                                <div class="card-footer fpms-wizard-foot">
                                    <button class="btn btn-default" (click)="go(2)">Back</button>
                                    <button class="btn btn-primary btn-lg" [disabled]="busy() || !confirmDelivery" (click)="create()">
                                        @if (busy()) { <i class="fas fa-spinner fa-spin mr-1"></i> }
                                        Create {{ selected.length === 1 ? 'batch' : selected.length + ' batches' }}
                                    </button>
                                </div>
                            </div>
                        }
                        @case (4) {
                            <div class="card card-outline card-success">
                                <div class="card-header"><h3 class="card-title">Created</h3></div>
                                <div class="card-body">
                                    <p>
                                        Cycle <a [routerLink]="['/app/production/cycles', result.cycleId]"><strong>{{ result.cycleCode }}</strong></a>
                                        {{ result.cycleCreated ? 'started (Active)' : 'updated' }}. PL left in the delivery: {{ result.plLeft | num: 0 }}.
                                    </p>
                                    <ul>
                                        @for (b of result.batches; track b.id) {
                                            <li><a [routerLink]="['/app/production/batches', b.id]">{{ b.batchCode }}</a> in {{ b.pondCode }} · {{ b.stockingDensityPerM2 | num: 1 }} PL/m²</li>
                                        }
                                    </ul>
                                    <fpms-warnings [warnings]="result.warnings"></fpms-warnings>
                                </div>
                            </div>
                        }
                    }
                }
                </div>
            </div>
        </div>
    `,
})
export class CreateBatchComponent extends FpmsPage implements OnInit {
    /** Step names in the step bar. The created batches (step 4) are the result of Review, not a step of their own (DEC-96). */
    readonly stepNames = ['Fry source', 'Ponds', 'Batch details', 'Review'];
    readonly nowInput = FarmTime.nowInput();
    step = 0;
    options: any = null;
    cycleId: string | null = null;

    /** Closing the dialog goes back to where it was opened from. */
    get closeLink(): any[] {
        return this.cycleId ? ['/app/production/cycles', this.cycleId] : ['/app/production/batches'];
    }
    cycleCode: string | null = null;
    deliveryId: string | null = null;
    allocations: Allocation[] = [];
    stockingParams: any[] = [];
    result: any = null;
    confirmDelivery = false;
    private clientRequestId = newGuid();

    /** DEC-76: every received, open delivery is offered, newest first, whatever its age. */
    get shownDeliveries(): any[] {
        return this.options?.deliveries ?? [];
    }

    /** The stocking date can be any time from the delivery's received date up to now. */
    get windowMin(): string {
        return this.delivery ? `${this.delivery.deliveryDate}T00:00` : '';
    }

    get windowMax(): string {
        return this.nowInput;
    }

    inWindow(a: Allocation): boolean {
        return !!a.stockedAt && a.stockedAt >= this.windowMin && a.stockedAt <= this.windowMax;
    }

    ago(days: number): string {
        return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
    }

    densityState(a: Allocation): 'within' | 'below' | 'above' {
        const d = (Number(a.plCount) || 0) / a.pond.areaM2;
        if (a.pond.bandMinPlM2 != null && d < a.pond.bandMinPlM2) {
            return 'below';
        }
        if (a.pond.bandMaxPlM2 != null && d > a.pond.bandMaxPlM2) {
            return 'above';
        }
        return 'within';
    }

    bandText(p: any): string {
        if (p.bandMinPlM2 == null && p.bandMaxPlM2 == null) {
            return 'no range set (Farm standards)';
        }
        return `range ${p.bandMinPlM2 ?? 0}–${p.bandMaxPlM2 ?? '∞'} PL/m² (${p.bandSource ?? 'standard'})`;
    }

    get delivery(): any {
        return this.options?.deliveries.find((d: any) => d.id === this.deliveryId);
    }

    get selected(): Allocation[] {
        return this.allocations.filter((a) => a.selected);
    }

    get allocated(): number {
        return this.selected.reduce((sum, a) => sum + (Number(a.plCount) || 0), 0);
    }

    get remaining(): number {
        return (this.delivery?.plLeft ?? 0) - this.allocated;
    }

    readonly badCount = (a: Allocation): boolean => !a.plCount || a.plCount < 1 || !Number.isInteger(Number(a.plCount));

    /** The step lives in the address (?step=n), so the browser Back button goes one step back. */
    private wizard = new WizardSteps(0, () => this.furthestStep(), (n) => this.showStep(n));
    private started = false;

    ngOnInit(): void {
        this.route.queryParamMap.subscribe(async (q) => {
            if (!this.started || q.get('cycleId') !== this.cycleId) {
                this.started = true;
                await this.init();
            }
            this.wizard.sync(q);
        });
    }

    /** The furthest step the current answers allow (a reload starts again at the first step). */
    private furthestStep(): number {
        if (this.result) {
            return 4;
        }
        if (!this.options || !this.delivery) {
            return 0;
        }
        if (!this.selected.length || this.remaining < 0 || this.selected.some(this.badCount)) {
            return 1;
        }
        return this.detailsValid() ? 3 : 2;
    }

    private showStep(step: number): void {
        if (this.result && step < 4) {
            // Back from the result page starts a new stocking rather than returning to a submitted review.
            this.init().then(() => this.wizard.sync());
            return;
        }
        this.step = step;
        window.scrollTo({ top: 0 });
    }

    async init(): Promise<void> {
        this.cycleId = this.query('cycleId');
        this.step = 0;
        this.wizard.reset();
        this.result = null;
        this.clientRequestId = newGuid();
        const [options, params] = await Promise.all([
            this.api.get<any>('Cycle', 'GetStockingOptions', { cycleId: this.cycleId }),
            this.api.get<any[]>('Log', 'GetParameters'),
        ]);
        this.stockingParams = params.filter((p) => p.requiredAtStocking && p.isActive);
        this.cycleCode = options.cycleCode;
        this.deliveryId = options.deliveries.length === 1 ? options.deliveries[0].id : null;
        this.confirmDelivery = false;
        this.allocations = options.ponds.map((pond: any) => ({
            pond,
            selected: false,
            plCount: null,
            stockedAt: FarmTime.nowInput(),
            acclimationMinutes: null,
            technicianUserIds: [],
            initialSurvivalEstimatePct: null,
            deadAtStocking: null,
            targetHarvestAbwG: options.defaultHarvestTargetAbwG ?? null,
            maxCultureDays: options.defaultMaxCultureDays ?? 90,
            readings: Object.fromEntries(this.stockingParams.map((p) => [p.code, null])),
        }));
        this.options = options;
        // DEC-127: the Owner names who looks after each new batch; anyone stocking without that right skips the choice.
        this.people = this.can('Farm.Production.Manage') ? ((await this.run(() => this.api.get<any[]>('Batch', 'GetTechnicianOptions'))) ?? []) : [];
        const techs = this.people.filter((x) => x.isTechnician);
        if (techs.length === 1) {
            this.allocations.forEach((a) => (a.technicianUserIds = [techs[0].id]));
        }
    }

    people: any[] = [];

    peopleNames(ids: number[]): string {
        return joinNames(this.people.filter((x) => ids.includes(x.id)).map((x) => x.name)) || 'No one named';
    }

    toggleTech(a: Allocation, id: number): void {
        a.technicianUserIds = a.technicianUserIds.includes(id) ? a.technicianUserIds.filter((x) => x !== id) : [...a.technicianUserIds, id];
    }

    go(step: number): void {
        if (step === 2) {
            // A delivery received days ago defaults to the last moment of its window, never to "now" outside it.
            for (const a of this.selected) {
                if (!this.inWindow(a)) {
                    a.stockedAt = this.windowMax;
                }
            }
        }
        this.wizard.go(step, step === 4);
    }

    state(p: any, a: Allocation): 'empty' | 'ok' | 'out' | 'invalid' {
        return optimalState(p, a.readings[p.code]);
    }

    advice(p: any, a: Allocation): string {
        const v = Number(a.readings[p.code]);
        return (p.optimalMin != null && v < p.optimalMin ? p.lowRecommendation : p.highRecommendation) ?? '';
    }

    detailsValid(): boolean {
        return this.selected.every(
            (a) =>
                !!a.stockedAt &&
                this.inWindow(a) &&
                this.stockingParams.every((p) => ['ok', 'out'].includes(this.state(p, a))) &&
                (a.deadAtStocking == null || a.deadAtStocking >= 0)
        );
    }

    copyFromFirst(a: Allocation): void {
        const f = this.selected[0];
        a.stockedAt = f.stockedAt;
        a.acclimationMinutes = f.acclimationMinutes;
        a.initialSurvivalEstimatePct = f.initialSurvivalEstimatePct;
        a.deadAtStocking = f.deadAtStocking;
        a.targetHarvestAbwG = f.targetHarvestAbwG;
        a.maxCultureDays = f.maxCultureDays;
        a.technicianUserIds = [...f.technicianUserIds];
        a.readings = { ...f.readings };
    }

    readingsLine(a: Allocation): string {
        return this.stockingParams.map((p) => `${a.readings[p.code]}${this.state(p, a) === 'out' ? ' ⚠' : ''}`).join(' / ');
    }

    async create(): Promise<void> {
        const body = {
            fryDeliveryId: this.cycleId ? null : this.deliveryId,
            cycleId: this.cycleId,
            clientRequestId: this.clientRequestId,
            batches: this.selected.map((a) => ({
                pondId: a.pond.id,
                plCount: a.plCount,
                stockedAt: FarmTime.fromLocalInput(a.stockedAt),
                acclimationMinutes: a.acclimationMinutes,
                initialSurvivalEstimatePct: a.initialSurvivalEstimatePct,
                deadAtStocking: a.deadAtStocking,
                targetHarvestAbwG: a.targetHarvestAbwG,
                maxCultureDays: a.maxCultureDays,
                technicianUserIds: a.technicianUserIds,
                readings: this.stockingParams.map((p) => ({ parameterCode: p.code, value: a.readings[p.code] })),
            })),
        };
        let result: any;
        if (await this.act(async () => (result = await this.api.post<any>('Cycle', 'CreateBatches', body)))) {
            this.result = result;
            this.notifySaved(result.cycleCreated ? `Cycle ${result.cycleCode} started.` : `Batches added to ${result.cycleCode}.`);
            this.go(4);
        }
    }
}
