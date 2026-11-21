import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';

/** One fry delivery: details (Owner edits), status updates with notes (Owner or Technician), dated history (AC-06). */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header [title]="d?.hatcheryBatchNumber ?? 'Fry delivery'" [subtitle]="d ? 'Post-larvae from ' + d.hatcheryName + (arrived() ? '. Arrived ' : '. Expected ') + (d.deliveryDate | farmDate) + '.' : ''" backLink="/app/resources/fry-deliveries" backLabel="Fry deliveries">
            @if (d) {
                <fpms-badge [text]="d.isStocked ? 'Stocked' : (d.status | label: L.FryDeliveryStatuses)"></fpms-badge>
                @if (d.isStockingFinished) { <span class="badge badge-dark ml-1">Stocking finished</span> }
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                @if (!d) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @if (receiving) {
                        <!-- DEC-131: arrival is its own step: when, the farm's count, and the papers and trip that came with the fry. -->
                        <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="rv-h"><div class="fpms-dialog-body p-0"><div class="card card-outline card-primary mb-0 border-0">
                            <div class="card-header"><h3 class="card-title" id="rv-h"><i class="fas fa-box-open" aria-hidden="true"></i>Receive fry · {{ d.hatcheryBatchNumber }}</h3></div>
                            <form #rf="ngForm" (ngSubmit)="saveReceive()" fpmsReview="arrival" [fpmsReviewNew]="true" novalidate>
                                <div class="card-body">
                                    <div class="form-row">
                                        <div class="form-group col-md-4">
                                            <label for="r-at">Arrived <span class="text-danger">*</span></label>
                                            <input id="r-at" type="datetime-local" class="form-control" name="receivedAt" [(ngModel)]="receiving.receivedAt" [max]="nowInput" required />
                                        </div>
                                        <div class="form-group col-md-4">
                                            <label for="r-pl">PL counted at the farm <span class="text-danger">*</span></label>
                                            <input id="r-pl" type="number" min="1" max="10000000" step="1" class="form-control" name="plReceived" [(ngModel)]="receiving.plReceived" required />
                                            @if (d.plOrdered && receiving.plReceived > 0) {
                                                <small class="form-text text-muted">{{ extraText({ plReceived: receiving.plReceived, plOrdered: d.plOrdered }) }}</small>
                                            } @else {
                                                <small class="form-text text-muted">Stocking, survival and density use this count.</small>
                                            }
                                        </div>
                                        <div class="form-group col-md-4">
                                            <label for="r-age">PL age (days)</label>
                                            <input id="r-age" type="number" min="1" max="60" step="1" class="form-control" name="plAgeDays" [(ngModel)]="receiving.plAgeDays" />
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group col-md-4">
                                            <label for="r-phc">PL health certificate no.</label>
                                            <input id="r-phc" class="form-control" name="plHealthCertificateNo" [(ngModel)]="receiving.plHealthCertificateNo" maxlength="100" />
                                        </div>
                                        <div class="form-group col-md-4">
                                            <label for="r-sfsc">Shrimp Fry Source Certificate no.</label>
                                            <input id="r-sfsc" class="form-control" name="sfscNo" [(ngModel)]="receiving.sfscNo" maxlength="100" placeholder="optional" />
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group col-md-4">
                                            <label for="r-n">Note</label>
                                            <input id="r-n" class="form-control" name="note" [(ngModel)]="receiving.note" maxlength="500" placeholder="e.g. 2 bags damaged" />
                                        </div>
                                    </div>
                                    <p class="small text-muted mb-0">Dead or discarded fry are accounted for later, with Finish stocking.</p>
                                </div>
                                <div class="card-footer">
                                    <button type="submit" class="btn btn-primary mr-2" [disabled]="busy() || !rf.form.valid">Save arrival</button>
                                    <button type="button" class="btn btn-default" (click)="receiving = null">Cancel</button>
                                    <fpms-form-hint [form]="rf"></fpms-form-hint>
                                </div>
                            </form>
                        </div></div></div></div>
                    }
                    <!-- Summary band (DEC-99, DEC-111): where the delivery's PL went, then where it stands. -->
                    <section class="fpms-summary" aria-label="Summary">
                        <dl class="fpms-figures">
                            @if (d.plReceived) {
                                <div class="fpms-figure"><dt class="l">PL counted</dt><dd class="v">{{ d.plReceived | num: 0 }}</dd><dd class="s">{{ d.plOrdered ? extraText(d) : 'No PO count recorded' }}</dd></div>
                            } @else {
                                <div class="fpms-figure"><dt class="l">PL ordered</dt><dd class="v">{{ d.plOrdered ? (d.plOrdered | num: 0) : '—' }}</dd><dd class="s">Counted when the fry arrive</dd></div>
                            }
                            <div class="fpms-figure"><dt class="l">Stocked</dt><dd class="v">{{ d.plStocked | num: 0 }}</dd></div>
                            <div class="fpms-figure"><dt class="l">{{ d.isStockingFinished ? 'Not stocked' : 'Left to stock' }}</dt><dd class="v">{{ (d.isStockingFinished ? d.plNotStocked : d.plLeft) | num: 0 }}</dd></div>
                            <div class="fpms-figure"><dt class="l">PL age</dt><dd class="v">{{ d.plAgeDays != null ? 'PL' + d.plAgeDays : '—' }}</dd></div>
                        </dl>
                        @if (d.cycleId || d.isStockingFinished) {
                            <ul class="fpms-notices">
                                @if (d.cycleId) {
                                    <li><i class="fas fa-shrimp" aria-hidden="true"></i><span>Stocked into cycle <a [routerLink]="['/app/production/cycles', d.cycleId]">{{ d.cycleCode }}</a>.</span></li>
                                }
                                @if (d.isStockingFinished) {
                                    <li>
                                        <i class="fas fa-check" aria-hidden="true"></i>
                                        <span>
                                            Stocking finished {{ d.stockingFinishedAtUtc | farmDateTime }} by {{ d.stockingFinishedBy }}.
                                            @for (s of d.shortfalls; track s.reason) {
                                                {{ s.reason | label: L.ShortfallReasons }}: <strong>{{ s.count | num: 0 }} PL</strong>{{ s.note ? ' (' + s.note + ')' : '' }}.
                                            } @empty {
                                                Every PL received was stocked.
                                            }
                                        </span>
                                    </li>
                                }
                            </ul>
                        }
                    </section>
                    @if (d.pondAllocations?.length) {
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Planned destination ponds</h3></div>
                            <div class="card-body p-0 table-responsive">
                                <table class="table table-sm mb-0">
                                    <thead><tr><th>Pond</th><th class="text-right">Planned PL</th><th>Status</th></tr></thead>
                                    <tbody>
                                        @for (a of d.pondAllocations; track a.id) {
                                            <tr>
                                                <td><a [routerLink]="['/app/ponds', a.pondId]">{{ a.pondCode }}</a><div class="small text-muted">{{ a.pondName }}</div></td>
                                                <td class="text-right">{{ a.plannedPlCount | num: 0 }}</td>
                                                <td>{{ a.fulfilledAtUtc ? 'Stocked' : a.releasedAtUtc ? 'Released' : 'Reserved' }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                    <!-- The form takes the width on a laptop; the status column sits beside it from 1,200 px (DEC-111). -->
                        <!-- DEC-131: the delivery's steps, and only the next ones that make sense. -->
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Steps</h3></div>
                            <div class="card-body">
                                <ol class="fpms-dsteps" aria-label="Delivery steps">
                                    @for (s of stepLine(); track s.label) {
                                        <li [class.done]="s.state === 'done'" [class.now]="s.state === 'now'" [class.ended]="s.state === 'ended'" [attr.aria-current]="s.state === 'now' ? 'step' : null">
                                            <i class="fas" [class.fa-check-circle]="s.state === 'done'" [class.fa-dot-circle]="s.state === 'now'" [class.fa-times-circle]="s.state === 'ended'" [class.fa-circle]="s.state === 'todo'" aria-hidden="true"></i>
                                            <span>{{ s.label }}</span>
                                            @if (s.when) { <small class="text-muted">{{ s.when | farmDateTime }}</small> }
                                        </li>
                                    }
                                </ol>
                                @if (d.canUpdateStatus && !step) {
                                    <div class="fpms-step-actions">
                                        @if (next().includes(3)) {
                                            <button type="button" class="btn btn-primary" (click)="startReceive()"><i class="fas fa-box-open mr-1" aria-hidden="true"></i>Receive fry</button>
                                        }
                                        @if (next().includes(2)) {
                                            <button type="button" class="btn btn-outline-primary" (click)="startStep(2)"><i class="fas fa-truck mr-1" aria-hidden="true"></i>Mark in transit</button>
                                        }
                                        @if (next().includes(5)) {
                                            <button type="button" class="btn btn-outline-danger" (click)="startStep(5)">Cancel order</button>
                                        }
                                        @if (next().includes(4)) {
                                            <button type="button" class="btn btn-outline-danger" (click)="startStep(4)">Reject fry</button>
                                        }
                                    </div>
                                }
                                @if (step) {
                                    <form #sf="ngForm" class="fpms-step-form" (ngSubmit)="saveStep()" novalidate>
                                        <h4 class="fpms-section-h">{{ stepTitle() }}</h4>
                                        @if (step.status !== 0) {
                                            <div class="form-group">
                                                <label for="sw">When</label>
                                                <input id="sw" type="datetime-local" class="form-control" name="when" [(ngModel)]="step.when" [max]="nowInput" />
                                            </div>
                                        }
                                        <div class="form-group">
                                            <label for="sr">{{ step.status === 2 ? 'Note' : 'Reason' }} @if (step.status !== 2) { <span class="text-danger">*</span> }</label>
                                            <input id="sr" class="form-control" name="note" [(ngModel)]="step.note" maxlength="500" [required]="step.status !== 2" minlength="3"
                                                [placeholder]="step.status === 2 ? 'e.g. left the hatchery 4 AM' : step.status === 5 ? 'e.g. hatchery had no stock' : step.status === 4 ? 'e.g. weak fry, failed the stress test' : 'e.g. marked Received by mistake'" />
                                        </div>
                                        <button type="submit" class="btn mr-2" [class.btn-primary]="step.status === 2" [class.btn-danger]="step.status !== 2" [disabled]="busy() || !sf.form.valid">{{ stepTitle() }}</button>
                                        <button type="button" class="btn btn-default" (click)="step = null">Cancel</button>
                                    </form>
                                }
                                @if (d.canEdit && d.canUpdateStatus && d.history.length > 1 && !step) {
                                    <button type="button" class="btn btn-link px-0 mt-2" (click)="startStep(0)">Take back the last step</button>
                                }
                            </div>
                        </div>
                    <div class="row">
                        <div class="col-xl-8">
                            <form #f="ngForm" (ngSubmit)="save()" fpmsReview="delivery" novalidate>
                                <fieldset [disabled]="!d.canEdit">
                                    <div class="card">
                                        <div class="card-header"><h3 class="card-title">Delivery</h3></div>
                                        <div class="card-body">
                                                                                        <div class="form-row">
                                                <div class="form-group col-md-4">
                                                    <label for="bn">Hatchery batch number <span class="text-danger">*</span></label>
                                                    <input id="bn" class="form-control" name="hatcheryBatchNumber" [(ngModel)]="m.hatcheryBatchNumber" required maxlength="100" />
                                                </div>
                                                <div class="form-group col-md-4">
                                                    <label for="dd">{{ arrived() ? 'Delivery date' : 'Expected' }} <span class="text-danger">*</span></label>
                                                    <input id="dd" type="date" class="form-control" name="deliveryDate" [(ngModel)]="m.deliveryDate" required />
                                                </div>
                                                <div class="form-group col-md-4">
                                                    <label for="cost">Cost (₱)</label>
                                                    <input id="cost" type="number" min="0" step="0.01" class="form-control" name="costPhp" [(ngModel)]="m.costPhp" />
                                                </div>
                                            </div>
                                            <div class="form-row">
                                                <div class="form-group col-md-4">
                                                    <label for="pl">PL counted at the farm @if (arrived()) { <span class="text-danger">*</span> }</label>
                                                    @if (arrived()) {
                                                        <input id="pl" type="number" min="1" max="10000000" class="form-control" name="plReceived" [(ngModel)]="m.plReceived" required />
                                                        @if (d.isStocked) {
                                                            <small class="form-text text-muted">{{ d.plStocked | num: 0 }} PL already stocked.{{ d.isStockingFinished ? ' Fixed after Finish stocking.' : '' }}</small>
                                                        }
                                                    } @else {
                                                        <!-- DEC-131: an order has no count until Receive fry. -->
                                                        <input id="pl" class="form-control" value="Counted at arrival" disabled />
                                                    }
                                                </div>
                                                <div class="form-group col-md-4">
                                                    <label for="plo">PL ordered (PO)</label>
                                                    <input id="plo" type="number" min="1" max="10000000" class="form-control" name="plOrdered" [(ngModel)]="m.plOrdered" />
                                                    @if (m.plOrdered > 0 && m.plReceived > 0) {
                                                        <small class="form-text text-muted">{{ extraText(m) }}</small>
                                                    }
                                                </div>
                                                <div class="form-group col-md-4">
                                                    <label for="age">PL age (days)</label>
                                                    <input id="age" type="number" min="1" max="60" class="form-control" name="plAgeDays" [(ngModel)]="m.plAgeDays" />
                                                </div>
                                            </div>
                                            @if (arrived()) {
                                            <div class="form-row">
                                                <div class="form-group col-md-4">
                                                    <label for="phc">PL health certificate no.</label>
                                                    <input id="phc" class="form-control" name="plHealthCertificateNo" [(ngModel)]="m.plHealthCertificateNo" maxlength="100" />
                                                </div>
                                                <div class="form-group col-md-4">
                                                    <label for="sfsc">Shrimp Fry Source Certificate no.</label>
                                                    <input id="sfsc" class="form-control" name="sfscNo" [(ngModel)]="m.sfscNo" maxlength="100" placeholder="optional" />
                                                </div>
                                            </div>
                                            } @else {
                                                <p class="text-muted">The papers are entered with <strong>Receive fry</strong> when the fry arrive.</p>
                                            }
                                            <div class="form-row">
                                                <div class="form-group col-md-12">
                                                    <label for="n">Notes</label>
                                                    <input id="n" class="form-control" name="notes" [(ngModel)]="m.notes" maxlength="500" />
                                                </div>
                                            </div>

                                        </div>
                                        @if (d.canEdit) {
                                            <div class="card-footer">
                                                <button type="submit" class="btn btn-primary" [disabled]="busy() || !f.form.valid">Save</button>
                                                <fpms-form-hint [form]="f"></fpms-form-hint>
                                            </div>
                                        }
                                    </div>
                                </fieldset>
                            </form>
                            @if (!d.isStockingFinished && d.canFinishStocking) {
                                <div class="card card-outline card-primary">
                                    <div class="card-header"><h3 class="card-title">Finish stocking</h3></div>
                                    <div class="card-body">
                                        <p class="small">
                                            Record the PL from this delivery that were not stocked, so the delivery adds up. Afterwards no more ponds can be stocked from it.
                                            <strong>{{ d.plReceived - d.plStocked | num: 0 }} PL</strong> to account for ({{ d.plReceived | num: 0 }} received − {{ d.plStocked | num: 0 }} stocked).
                                        </p>
                                        @for (s of shortfalls; track $index) {
                                            <div class="form-row align-items-end">
                                                <div class="form-group col-5">
                                                    <label class="small" [for]="'sr' + $index">Reason</label>
                                                    <select [id]="'sr' + $index" class="form-control form-control-sm" [(ngModel)]="s.reason">
                                                        @for (o of Options.shortfallReason; track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                                                    </select>
                                                </div>
                                                <div class="form-group col-3">
                                                    <label class="small" [for]="'sc' + $index">PL</label>
                                                    <input [id]="'sc' + $index" type="number" min="1" step="1" class="form-control form-control-sm" [(ngModel)]="s.count" />
                                                </div>
                                                <div class="form-group col-3">
                                                    <label class="small" [for]="'sn' + $index">Note</label>
                                                    <input [id]="'sn' + $index" class="form-control form-control-sm" [(ngModel)]="s.note" maxlength="500" />
                                                </div>
                                                <div class="form-group col-1">
                                                    <button type="button" class="btn btn-sm btn-link text-danger px-0" (click)="shortfalls.splice($index, 1)" aria-label="Remove line"><i class="fas fa-times"></i></button>
                                                </div>
                                            </div>
                                        }
                                        <button type="button" class="btn btn-sm btn-link px-0" (click)="addShortfall()"><i class="fas fa-plus mr-1"></i>Add a reason</button>
                                        <div class="small mt-1" [class.text-danger]="shortfallGap !== 0" [class.text-success]="shortfallGap === 0">
                                            Stocked {{ d.plStocked | num: 0 }} + not stocked {{ shortfallTotal | num: 0 }} = {{ d.plStocked + shortfallTotal | num: 0 }} of {{ d.plReceived | num: 0 }} received
                                            {{ shortfallGap === 0 ? '✓' : '(' + (shortfallGap | num: 0) + ' still to account for)' }}
                                        </div>
                                    </div>
                                    <div class="card-footer">
                                        <button class="btn btn-primary" [disabled]="busy() || shortfallGap !== 0 || !shortfallsValid()" (click)="finishStocking()">Finish stocking</button>
                                    </div>
                                </div>
                            } @else if (d.status === 3 && can('Farm.Production.Stock')) {
                                <a class="btn btn-outline-primary mb-3" routerLink="/app/production/create-batch"><i class="fas fa-shrimp mr-1"></i>Stock a batch from this delivery</a>
                            }
                        </div>
                        <div class="col-xl-4">
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">History</h3></div>
                                <ul class="list-group list-group-flush">
                                    @for (h of d.history; track $index) {
                                        <li class="list-group-item py-2">
                                            <div><fpms-badge [text]="h.status | label: L.FryDeliveryStatuses"></fpms-badge> <span class="small text-muted ml-1">{{ h.changedAtUtc | farmDateTime }} · {{ h.changedBy }}</span></div>
                                            @if (h.note) { <div class="small">{{ h.note }}</div> }
                                        </li>
                                    }
                                </ul>
                            </div>
                        </div>
                    </div>
                }
            </div>
        </section>
    `,
})
export class FryDeliveryDetailComponent extends FpmsPage implements OnInit {
    d: any = null;
    m: any = {};
    /** Mark in transit (2), Reject (4), Cancel (5), or take back the last step (0); DEC-131. */
    step: { status: number; when: string; note: string } | null = null;
    receiving: any = null;
    shortfalls: { reason: number; count: number | null; note: string }[] = [];
    readonly nowInput = FarmTime.nowInput();

    get shortfallTotal(): number {
        return this.shortfalls.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    }

    get shortfallGap(): number {
        return this.d ? this.d.plReceived - this.d.plStocked - this.shortfallTotal : 0;
    }

    shortfallsValid(): boolean {
        const reasons = this.shortfalls.map((s) => s.reason);
        return new Set(reasons).size === reasons.length && this.shortfalls.every((s) => s.reason && Number(s.count) > 0);
    }

    addShortfall(): void {
        const used = this.shortfalls.map((s) => s.reason);
        const next = this.Options.shortfallReason.find((o) => !used.includes(o.value));
        this.shortfalls.push({ reason: next?.value ?? 1, count: null, note: '' });
    }

    async finishStocking(): Promise<void> {
        const body = {
            deliveryId: this.d.id,
            rowVersion: this.d.rowVersion,
            shortfalls: this.shortfalls.map((s) => ({ reason: s.reason, count: Number(s.count), note: s.note })),
        };
        if (await this.act(() => this.api.post('FryDelivery', 'FinishStocking', body))) {
            this.notifySaved('Stocking finished. The delivery is accounted for.');
            this.load();
        }
    }

    ngOnInit(): void {
        this.route.paramMap.subscribe(() => this.load());
    }

    async load(): Promise<void> {
        const d = await this.api.get<any>('FryDelivery', 'Get', { id: this.param('id') });
        this.m = { ...d, timePacked: d.timePackedUtc ? FarmTime.toLocalInput(d.timePackedUtc) : '' };
        this.step = null;
        this.receiving = null;
        const gap = d.plReceived - d.plStocked;
        this.shortfalls = gap > 0 ? [{ reason: 1, count: gap, note: '' }] : [];
        this.d = d;
        this.setPageTitle(d ? `Fry delivery ${d.hatcheryBatchNumber}` : null);
    }

    /** The farm's count against the hatchery's papers (DEC-93): "17,810 more than the papers (+17.8%)". */
    extraText(x: any): string {
        const diff = Number(x.plReceived) - Number(x.plOrdered);
        if (!diff) {
            return 'Same as ordered.';
        }
        const pct = Math.round((Math.abs(diff) / Number(x.plOrdered)) * 1000) / 10;
        return `${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'more' : 'fewer'} than ordered (${diff > 0 ? '+' : '−'}${pct}%).`;
    }

    async save(): Promise<void> {
        let result: any;
        if (await this.act(async () => (result = await this.api.put<any>('FryDelivery', 'Update', { ...this.m, timePacked: this.m.timePacked ? FarmTime.fromLocalInput(this.m.timePacked) : null })))) {
            this.notifySaved('Delivery saved.');
            if (result?.warnings?.length) {
                this.showWarnings(result.warnings);
            }
            this.load();
        }
    }

    /** The fry are at the farm (Received, or already stocked): only then is there a count to edit. */
    arrived(): boolean {
        return this.d?.status === 3 || !!this.d?.isStocked;
    }

    /** The steps a delivery may take next, as the server allows them (FryDeliveryFlow, DEC-131). */
    next(): number[] {
        return ({ 1: [2, 3, 5], 2: [3, 4], 3: [4] } as Record<number, number[]>)[this.d?.status] ?? [];
    }

    /** Ordered → In transit → Received → Stocked, with the time of each step reached; an ended delivery shows how it ended. */
    stepLine(): { label: string; state: 'done' | 'now' | 'todo' | 'ended'; when?: string }[] {
        const at = (status: number) => [...(this.d.history ?? [])].reverse().find((h: any) => h.status === status)?.changedAtUtc;
        const ended = this.d.status === 4 || this.d.status === 5;
        const reached = (status: number) => !!at(status);
        const line: { label: string; state: 'done' | 'now' | 'todo' | 'ended'; when?: string }[] = [
            { label: 'Ordered', state: reached(1) ? 'done' : 'todo', when: at(1) },
            { label: 'In transit', state: reached(2) ? 'done' : 'todo', when: at(2) },
            { label: 'Received', state: reached(3) ? 'done' : 'todo', when: at(3) },
        ];
        if (ended) {
            line.push({ label: this.d.status === 5 ? 'Cancelled' : 'Rejected', state: 'ended', when: at(this.d.status) });
            // Steps never reached before the end are left out, so the line reads as it happened.
            return line.filter((x) => x.state !== 'todo');
        }
        line.push({ label: 'Stocked', state: this.d.isStocked ? 'done' : 'todo' });
        const current = this.d.isStocked ? 3 : line.findIndex((x) => x.label === (this.L.FryDeliveryStatuses as any)[this.d.status]);
        if (!this.d.isStocked && current >= 0) {
            line[current].state = 'now';
        }
        // A delivery logged at the gate never had an order step: start the line where it started.
        return line.filter((x, i) => x.state !== 'todo' || i > Math.max(0, current));
    }

    stepTitle(): string {
        return { 0: 'Take back the last step', 2: 'Mark in transit', 4: 'Reject fry', 5: 'Cancel order' }[this.step?.status ?? 2] ?? '';
    }

    startStep(status: number): void {
        this.step = { status, when: FarmTime.nowInput(), note: '' };
    }

    startReceive(): void {
        const d = this.d;
        this.receiving = {
            receivedAt: FarmTime.nowInput(), plReceived: null, plAgeDays: d.plAgeDays ?? null, note: '',
            plHealthCertificateNo: d.plHealthCertificateNo ?? '', transportPermitNo: d.transportPermitNo ?? '', sfscNo: d.sfscNo ?? '',
            transportMode: d.transportMode ?? null, timePacked: d.timePackedUtc ? FarmTime.toLocalInput(d.timePackedUtc) : '',
        };
    }

    async saveReceive(): Promise<void> {
        const r = this.receiving;
        const body = { ...r, deliveryId: this.d.id, receivedAt: FarmTime.fromLocalInput(r.receivedAt), timePacked: r.timePacked ? FarmTime.fromLocalInput(r.timePacked) : null };
        if (await this.act(() => this.api.post('FryDelivery', 'Receive', body))) {
            this.notifySaved(`Fry received: ${Number(r.plReceived).toLocaleString('en-US')} PL counted.`);
            this.load();
        }
    }

    async saveStep(): Promise<void> {
        const st = this.step!;
        const ok = st.status === 0
            ? await this.act(() => this.api.post('FryDelivery', 'UndoLastStep', { deliveryId: this.d.id, reason: st.note }))
            : await this.act(() => this.api.put('FryDelivery', 'UpdateStatus', { deliveryId: this.d.id, status: st.status, changedAt: st.when ? FarmTime.fromLocalInput(st.when) : null, note: st.note }));
        if (ok) {
            this.notifySaved({ 0: 'Last step taken back.', 2: 'Marked in transit.', 4: 'Fry rejected.', 5: 'Order cancelled.' }[st.status] ?? 'Saved.');
            this.load();
        }
    }
}
