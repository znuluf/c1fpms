import { Component, OnInit, computed, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { PagerState } from '@shared/fpms/pager';
import { EMPTY_GUID, FarmTime } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';
import { unbroken } from '@shared/fpms/labels';
import { ToolbarChip } from '@shared/fpms/ui';

/** Fry deliveries (Log Fries, Ref 3.1a; AC-06): one delivery of post-larvae from a hatchery starts one production cycle. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header
            title="Fry deliveries"
            subtitle="Post-larvae deliveries from hatcheries, with their status history.">
            @if (can('Farm.Reports')) {
                <button
                    class="fpms-button fpms-button-secondary fpms-icon-gap"
                    (click)="
                        exportCsv('ExportList', {
                            list: 'FryDeliveries',
                            deliveryStatus: status,
                            search: search || null,
                        })
                    "
                    [disabled]="busy()">
                    <i class="fas fa-file-csv fpms-icon-gap"></i>
                    Export CSV
                </button>
            }
            @if (canManage) {
                <!-- DEC-131: most fry are logged at the gate; an order before they arrive is the second choice. -->
                <button class="fpms-button fpms-button-outline fpms-icon-gap" (click)="startCreate(false)" [disabled]="!!form">
                    <i class="fas fa-file-signature fpms-icon-gap" aria-hidden="true"></i>
                    Record an order
                </button>
                <button class="fpms-button fpms-button-primary" (click)="startCreate(true)" [disabled]="!!form">
                    <i class="fas fa-plus fpms-icon-gap" aria-hidden="true"></i>
                    Record fry received
                </button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (form) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="fry-delivery-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head">
                                <h3 id="fry-delivery-dialog-title" class="fpms-panel-title">
                                    <i class="fas fa-truck" aria-hidden="true"></i>
                                    {{ arrived ? 'Record fry received' : 'Record an order' }}
                                </h3>
                            </div>
                            @if (!hatcheries().length) {
                                <div class="fpms-panel-body">
                                    <fpms-empty text="Add an active hatchery first." icon="fas fa-egg">
                                        <a routerLink="/app/resources/hatcheries" class="fpms-button fpms-button-compact fpms-button-primary">
                                            Go to hatchery sources
                                        </a>
                                    </fpms-empty>
                                </div>
                            } @else {
                                <form #f="ngForm" (ngSubmit)="save()" fpmsReview="delivery" [fpmsReviewNew]="true" novalidate>
                                    <div class="fpms-panel-body">
                                        <!-- DEC-131: fry at the gate are logged with the count; an order waits for Receive fry. -->
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="h">Hatchery <span class="fpms-danger">*</span></label>
                                                <select id="h" class="fpms-control" name="hatcheryId" [(ngModel)]="form.hatcheryId" required>
                                                    @for (h of hatcheries(); track h.id) {
                                                        <option [value]="h.id">{{ h.name }}</option>
                                                    }
                                                </select>
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="bn">Hatchery batch number <span class="fpms-danger">*</span></label>
                                                <input id="bn" class="fpms-control" name="hatcheryBatchNumber" [(ngModel)]="form.hatcheryBatchNumber" required maxlength="100" />
                                            </div>
                                            @if (arrived) {
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="ra">Arrived <span class="fpms-danger">*</span></label>
                                                    <input id="ra" type="datetime-local" class="fpms-control" name="receivedAt" [(ngModel)]="form.receivedAt" [max]="nowInput" required />
                                                </div>
                                            } @else {
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="dd">Expected <span class="fpms-danger">*</span></label>
                                                    <input id="dd" type="date" class="fpms-control" name="deliveryDate" [(ngModel)]="form.deliveryDate" required />
                                                </div>
                                            }
                                        </div>
                                        <div class="fpms-grid-row">
                                            @if (arrived) {
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="pl">PL counted at the farm <span class="fpms-danger">*</span></label>
                                                    <input id="pl" type="number" min="1" max="10000000" step="1" class="fpms-control" name="plReceived" [(ngModel)]="form.plReceived" required />
                                                    <small class="fpms-help fpms-muted">Stocking, survival and density use this count.</small>
                                                </div>
                                            }
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="plo">PL ordered (PO) @if (!arrived) { <span class="fpms-danger">*</span> }</label>
                                                <input id="plo" type="number" min="1" max="10000000" step="1" class="fpms-control" name="plOrdered" [(ngModel)]="form.plOrdered" [required]="!arrived" />
                                                @if (arrived && form.plOrdered > 0 && form.plReceived > 0) {
                                                    <small class="fpms-help fpms-muted">{{ extraText(form) }}</small>
                                                }
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="age">PL age (days)</label>
                                                <input id="age" type="number" min="1" max="60" step="1" class="fpms-control" name="plAgeDays" [(ngModel)]="form.plAgeDays" placeholder="12 for PL12" />
                                                @if (form.plAgeDays && (form.plAgeDays < 10 || form.plAgeDays > 20)) {
                                                    <small class="fpms-warning-text"><i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i>Outside the usual PL10–PL20 (the farm's range in Farm standards applies when saved).</small>
                                                }
                                            </div>
                                            @if (!arrived) {
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="cost">Cost (₱)</label>
                                                    <input id="cost" type="number" min="0" step="0.01" class="fpms-control" name="costPhp" [(ngModel)]="form.costPhp" />
                                                </div>
                                            }
                                        </div>
                                        @if (arrived) {
                                            <div class="fpms-grid-row">
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="phc">PL health certificate no.</label>
                                                    <input id="phc" class="fpms-control" name="plHealthCertificateNo" [(ngModel)]="form.plHealthCertificateNo" maxlength="100" />
                                                </div>
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="sfsc">Shrimp Fry Source Certificate no.</label>
                                                    <input id="sfsc" class="fpms-control" name="sfscNo" [(ngModel)]="form.sfscNo" maxlength="100" placeholder="optional" />
                                                </div>
                                            </div>
                                            <div class="fpms-grid-row">
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="cost">Cost (₱)</label>
                                                    <input id="cost" type="number" min="0" step="0.01" class="fpms-control" name="costPhp" [(ngModel)]="form.costPhp" />
                                                </div>
                                            </div>
                                        } @else {
                                            <p class="fpms-muted">The farm's count and the papers are entered with <strong>Receive fry</strong> when the fry arrive.</p>
                                        }
                                        @if (!arrived) {
                                            <div class="fpms-field fpms-space-top-3">
                                                <label>Planned destination ponds</label>
                                                <p class="fpms-muted fpms-space-bottom-2">Record the ponds the farm has already chosen. These are reservations only; actual stocking is recorded separately.</p>
                                                @for (allocation of form.pondAllocations; track $index) {
                                                    <div class="fpms-grid-row align-items-end fpms-space-bottom-2">
                                                        <div class="fpms-field fpms-col-md-6 fpms-space-bottom-1">
                                                            <label [for]="'alloc-pond-' + $index">Destination pond</label>
                                                            <select class="fpms-control" [id]="'alloc-pond-' + $index" [name]="'allocPond' + $index" [(ngModel)]="allocation.pondId" required>
                                                                <option value="">Choose pond</option>
                                                                @for (pond of pondOptions(); track pond.id) {
                                                                    <option [value]="pond.id" [disabled]="pond.isReserved || pondAlreadySelected(pond.id, $index)">{{ pond.pondCode }} — {{ pond.name }}{{ pond.isReserved ? ' (reserved)' : '' }}</option>
                                                                }
                                                            </select>
                                                            @if (allocation.pondId && pondIsReserved(allocation.pondId)) { <small class="fpms-danger">This pond is already reserved.</small> }
                                                        </div>
                                                        <div class="fpms-field fpms-col-md-4 fpms-space-bottom-1">
                                                            <label [for]="'alloc-pl-' + $index">Planned PL</label>
                                                            <input class="fpms-control" type="number" min="1" max="10000000" step="1" [id]="'alloc-pl-' + $index" [name]="'allocPl' + $index" [(ngModel)]="allocation.plannedPlCount" required />
                                                        </div>
                                                        <div class="fpms-field fpms-col-md-2 fpms-space-bottom-1"><button type="button" class="fpms-button fpms-button-danger fpms-button-block" (click)="removeAllocation($index)">Remove</button></div>
                                                    </div>
                                                }
                                                <button type="button" class="fpms-button fpms-button-compact fpms-button-outline" (click)="addAllocation()">Add destination pond</button>
                                                <div class="fpms-muted fpms-space-top-2">Planned: {{ allocationTotal() | num: 0 }} / {{ (form.plOrdered || 0) | num: 0 }} PL ordered</div>
                                                @if (allocationTotal() > (form.plOrdered || 0)) { <small class="fpms-danger">Planned allocation cannot exceed PL ordered.</small> }
                                            </div>
                                        }
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-12 fpms-no-bottom">
                                                <label for="n">Notes</label>
                                                <input id="n" class="fpms-control" name="notes" [(ngModel)]="form.notes" maxlength="500" />
                                            </div>
                                        </div>
                                    </div>
                                    <div class="fpms-panel-foot">
                                        <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !f.form.valid || (!arrived && allocationTotal() > (form.plOrdered || 0))">{{ arrived ? 'Save delivery' : 'Save order' }}</button>
                                        <button type="button" class="fpms-button fpms-button-secondary" (click)="form = null">Cancel</button>
                                        <fpms-form-hint [form]="f"></fpms-form-hint>
                                    </div>
                                </form>
                            }
                        </div>
                    </div></div></div>
                }
                <!-- Filters on the page ground, the list in one panel (DEC-107, DEC-111). -->
                <div class="fpms-list-filters">
                        <fpms-list-toolbar
                            placeholder="Search by hatchery lot, hatchery or certificate"
                            [search]="search"
                            [resultText]="resultText()"
                            [chips]="chips()"
                            [chip]="status"
                            (searchChange)="onSearch($event)"
                            (chipChange)="onStatus($event)"></fpms-list-toolbar>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!list()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!list().length) {
                            <fpms-empty
                                [text]="
                                    search || status !== null
                                        ? 'No deliveries match. Clear the search or the filter.'
                                        : 'No fry deliveries yet.'
                                "
                                icon="fas fa-truck"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <!-- Five columns that each hold what belongs together, so the list fits 1,000 px (DEC-111). -->
                                    <tr>
                                        <th scope="col" fpmsSort="hatcheryBatchNumber" [pager]="pager" (sorted)="load()">Delivery</th>
                                        <th scope="col" fpmsSort="deliveryDate" [pager]="pager" (sorted)="load()">Delivered</th>
                                        <th scope="col" class="fpms-align-end" fpmsSort="plReceived" [pager]="pager" (sorted)="load()" title="The farm's count, and how it compares with the PL ordered (DEC-93)">PL counted</th>
                                        <th scope="col" class="fpms-align-end">PL left</th>
                                        <th scope="col" fpmsSort="status" [pager]="pager" (sorted)="load()">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (d of list(); track d.id) {
                                        <tr>
                                            <td>
                                                <a class="fpms-nowrap" [routerLink]="['/app/resources/fry-deliveries', d.id]">{{ d.hatcheryBatchNumber }}</a>
                                                <div class="fpms-muted">{{ d.hatcheryName }}</div>
                                            </td>
                                            <td class="fpms-nowrap">
                                                {{ d.status === 1 || d.status === 2 ? 'Expected ' : '' }}{{ d.deliveryDate | farmDate }}
                                                <div class="fpms-muted">{{ d.plAgeDays != null ? 'PL' + d.plAgeDays : 'PL age not given' }}</div>
                                            </td>
                                            <td class="fpms-align-end">
                                                @if (d.plReceived) {
                                                    {{ d.plReceived | num: 0 }}
                                                    <div class="fpms-muted fpms-wrap-text" [title]="d.plOrdered ? (d.plOrdered | num: 0) + ' PL ordered' : 'No PO count recorded'">{{ d.plOrdered ? papersDiff(d) + ' vs. ordered' : 'No PO count' }}</div>
                                                } @else {
                                                    <!-- DEC-131: an order is counted when the fry arrive. -->
                                                    <span class="fpms-muted">Not counted</span>
                                                    <div class="fpms-muted fpms-wrap-text">{{ d.plOrdered ? (d.plOrdered | num: 0) + ' ordered' : '' }}</div>
                                                }
                                            </td>
                                            <td class="fpms-align-end">{{ d.plLeft ? (d.plLeft | num: 0) : '—' }}</td>
                                            <td>
                                                <fpms-badge [text]="d.isStocked ? 'Stocked' : (d.status | label: L.FryDeliveryStatuses)"></fpms-badge>
                                                @if (d.cycleId) {
                                                    <div><a [routerLink]="['/app/production/cycles', d.cycleId]">Cycle {{ unbroken(d.cycleCode) }}</a></div>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                    <fpms-pager [state]="pager" (changed)="load()"></fpms-pager>
                </div>
            </div>
        </section>
    `,
})
export class FryDeliveriesComponent extends FpmsPage implements OnInit {
    /** A code with non-breaking hyphens, so it wraps whole ("2026-09-SNA-01" never splits at a hyphen). */
    readonly unbroken = unbroken;

    list = signal<any[] | null>(null);
    hatcheries = signal<any[]>([]);
    pondOptions = signal<any[]>([]);
    counts = signal<Record<number, number>>({});
    total = signal(0);
    status: number | null = null;
    search = '';
    pager = new PagerState('deliveryDate desc');
    form: any = null;

    get canManage(): boolean {
        return this.can('Farm.FryDeliveries.Manage');
    }

    chips = computed<ToolbarChip[]>(() => {
        const c = this.counts();
        const all = (Object.values(c) as number[]).reduce((n, v) => n + v, 0);
        return [
            { value: null, label: 'All statuses', count: all },
            ...this.Options.fryDeliveryStatus.map((o: any) => ({
                value: o.value,
                label: o.label,
                count: c[o.value] ?? 0,
            })),
        ];
    });

    resultText = computed(() => (this.total() === 1 ? '1 delivery' : `${this.total()} deliveries`));

    ngOnInit(): void {
        this.restoreList(this.pager, this, { status: 'number', search: 'string' });
        this.load();
    }

    onSearch(value: string): void {
        this.search = value;
        this.pager.reset();
        this.load();
    }

    onStatus(value: unknown): void {
        this.status = value as number | null;
        this.pager.reset();
        this.load();
    }

    async load(): Promise<void> {
        const q = { search: this.search || undefined };
        const [r, counts] = await Promise.all([
            this.api.get<any>('FryDelivery', 'GetAll', { status: this.status, ...q, ...this.pager.params }),
            this.api.get<any[]>('FryDelivery', 'GetStatusCounts', q),
        ]);
        this.total.set(r.totalCount);
        this.counts.set(Object.fromEntries((counts ?? []).map((x) => [x.status, x.count])));
        this.list.set(r.items);
        const reload = this.pager.update(r.totalCount);
        this.syncPager(this.pager);
        if (reload) {
            await this.load();
        }
    }

    /** The form being filled is for fry at the gate (true) or an order not here yet (false), DEC-131. */
    get arrived(): boolean {
        return this.form?.initialStatus === 3;
    }

    readonly nowInput = FarmTime.nowInput();

    async startCreate(arrived = true): Promise<void> {
        const list = (await this.api.get<any[]>('Hatchery', 'GetLookup'));
        this.hatcheries.set(list);
        this.pondOptions.set(arrived ? [] : await this.api.get<any[]>('FryDelivery', 'GetPondAllocationOptions'));
        this.form = {
            id: EMPTY_GUID,
            hatcheryId: list[0]?.id ?? '',
            hatcheryBatchNumber: '',
            deliveryDate: this.today,
            plAgeDays: null,
            plReceived: null,
            plOrdered: null,
            costPhp: null,
            notes: '',
            plHealthCertificateNo: '',
            transportPermitNo: '',
            sfscNo: '',
            transportMode: null,
            timePacked: '',
            receivedAt: FarmTime.nowInput(),
            initialStatus: arrived ? 3 : 1,
            pondAllocations: [],
        };
    }

    addAllocation(): void { this.form.pondAllocations.push({ pondId: '', plannedPlCount: null }); }

    removeAllocation(index: number): void { this.form.pondAllocations.splice(index, 1); }

    allocationTotal(): number { return (this.form?.pondAllocations ?? []).reduce((sum: number, x: any) => sum + (Number(x.plannedPlCount) || 0), 0); }

    pondAlreadySelected(id: string, except: number): boolean { return this.form.pondAllocations.some((x: any, i: number) => i !== except && x.pondId === id); }

    pondIsReserved(id: string): boolean { return this.pondOptions().some((p) => p.id === id && p.isReserved); }

    /** "+3,000 (+1.0%)" in the list: the farm's count against the papers; a dash when the papers' count was not entered. */
    papersDiff(d: any): string {
        if (!d.plOrdered || !d.plReceived) {
            return '—';
        }
        const diff = Number(d.plReceived) - Number(d.plOrdered);
        if (!diff) {
            return 'Same';
        }
        const pct = Math.round((Math.abs(diff) / Number(d.plOrdered)) * 1000) / 10;
        return `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('en-US')} (${diff > 0 ? '+' : '−'}${pct}%)`;
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
        if (await this.act(async () => (result = await this.api.post<any>('FryDelivery', 'Create', {
                    ...this.form,
                    timePacked: this.arrived && this.form.timePacked ? FarmTime.fromLocalInput(this.form.timePacked) : null,
                    receivedAt: this.arrived ? FarmTime.fromLocalInput(this.form.receivedAt) : null,
                    plReceived: this.arrived ? this.form.plReceived : null,
                    pondAllocations: this.arrived ? [] : this.form.pondAllocations.filter((x: any) => x.pondId && x.plannedPlCount > 0),
                })))) {
            this.notifySaved(this.arrived ? 'Fry delivery recorded.' : 'Order recorded.');
            if (result?.warnings?.length) {
                this.showWarnings(result.warnings);
            }
            this.router.navigate(['/app/resources/fry-deliveries', result.id], { replaceUrl: true });
        }
    }
}
