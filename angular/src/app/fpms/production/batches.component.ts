import { Component, OnInit, computed, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { PagerState } from '@shared/fpms/pager';
import { FPMS_IMPORTS } from '../shared-imports';
import { ToolbarChip } from '@shared/fpms/ui';
import { batchShort, unbroken } from '@shared/fpms/labels';

/** All pond batches with live indicators (Ref 5.2). */
/** BatchStatus.Closed */
const CLOSED = 5;

@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Pond batches" subtitle="One batch per grow-out pond per cycle.">
            @if (can('Farm.Reports')) {
                <button
                    class="btn btn-outline-secondary"
                    (click)="
                        exportCsv('ExportList', {
                            list: 'Batches',
                            batchStatus: status,
                            openOnly: openOnly,
                            search: search || null,
                        })
                    "
                    [disabled]="busy()">
                    <i class="fas fa-file-csv mr-1"></i>
                    Export CSV
                </button>
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                <!-- Filters on the page ground, the list in one panel; six columns so the list fits 1,000 px (DEC-113). -->
                <div class="fpms-list-filters">
                    <fpms-list-toolbar
                        placeholder="Search by pond, batch or cycle"
                        [search]="search"
                        [resultText]="resultText()"
                        [chips]="chips()"
                        [chip]="chipValue"
                        (searchChange)="onSearch($event)"
                        (chipChange)="onStatus($event)"></fpms-list-toolbar>
                </div>
                <div class="card">
                    <div class="card-body p-0 table-responsive">
                        @if (failed()) {
                            <div class="alert alert-warning m-3 d-flex align-items-center" role="alert">
                                <span class="mr-auto">Production batches could not be loaded. Check the connection, then try again.</span>
                                <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="busy()" (click)="load()">Try again</button>
                            </div>
                        } @else if (!batches()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!batches().length) {
                            <fpms-empty
                                text="No batches match. Clear the search, or choose another status."
                                icon="fas fa-seedling">
                                @if (can('Farm.Production.Stock')) {
                                    <a routerLink="/app/production/create-batch" class="btn btn-sm btn-primary">
                                        Stock a batch
                                    </a>
                                }
                            </fpms-empty>
                        } @else {
                            <table class="table table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th fpmsSort="pondCode" [pager]="pager" (sorted)="load()" title="The pond and batch, its cycle and its status">Batch</th>
                                        <th fpmsSort="stockingDate" [pager]="pager" (sorted)="load()" title="Stocking date and PL stocked">Stocked</th>
                                        <th class="text-right" title="Day of culture">DOC</th>
                                        <th class="text-right">ABW (g)</th>
                                        <th class="text-right">FCR</th>
                                        <th class="text-right" title="Estimated survival">Survival</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (b of batches(); track b.id) {
                                        <tr class="fpms-clickable-row" tabindex="0" role="link" aria-label="Open batch details" (click)="openRecord(b.id, $event)" (keydown.enter)="openRecord(b.id, $event)">
                                            <td>
                                                <a (click)="$event.stopPropagation()" class="text-nowrap" [routerLink]="['/app/production/batches', b.id]" [title]="b.batchCode"><span class="fpms-pond-tag">{{ b.pondCode }}</span> {{ batchShort(b.batchCode) }}</a>
                                                <div class="text-muted">Cycle <a (click)="$event.stopPropagation()" [routerLink]="['/app/production/cycles', b.cycleId]">{{ unbroken(b.cycleCode) }}</a></div>
                                                <div class="mt-1"><fpms-badge [text]="b.status | label: L.BatchStatuses"></fpms-badge></div>
                                            </td>
                                            <td class="text-nowrap">
                                                {{ b.stockingDate | farmDate }}
                                                <div class="text-muted">{{ b.plCountStocked | num: 0 }} PL</div>
                                            </td>
                                            <td class="text-right">{{ b.doc ?? '—' }}</td>
                                            <td class="text-right">{{ b.currentAbwG | num: 2 }}</td>
                                            <td class="text-right">{{ b.fcrToDate | num: 2 }}</td>
                                            <td class="text-right" [class.text-warning-dark]="b.estimatedSurvivalPct > 100">
                                                @if (b.estimatedSurvivalPct !== null && b.estimatedSurvivalPct !== undefined) {
                                                    <span class="text-nowrap">{{ b.estimatedSurvivalPct | num: 1 }}%@if (b.estimatedSurvivalPct > 100) { <i class="fas fa-exclamation-triangle ml-1" aria-hidden="true"></i> }</span>
                                                    @if (b.estimatedSurvivalPct > 100) { <div title="Check the stocking count and the latest survival estimate">Above 100%</div> }
                                                } @else {
                                                    —
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
export class BatchesComponent extends FpmsPage implements OnInit {
    batches = signal<any[] | null>(null);
    counts = signal<Record<number, number>>({});
    failed = signal(false);
    private loadRequest = 0;
    status: number | null = null;
    openOnly = true;
    search = '';
    pager = new PagerState('default');
    readonly batchShort = batchShort;
    readonly unbroken = unbroken;

    /**
     * "Open batches" (the default: every status but Closed), one chip per status, then "All batches". One row of chips
     * replaces the old "Open batches only" box, so the two can no longer contradict each other (Closed with Open only).
     */
    chips = computed<ToolbarChip[]>(() => {
        const c = this.counts();
        const all = (Object.values(c) as number[]).reduce((n, v) => n + v, 0);
        const closed = c[CLOSED] ?? 0;
        return [
            { value: 'open', label: 'Open batches', count: all - closed },
            ...this.Options.batchStatus.map((o: any) => ({ value: o.value, label: o.label, count: c[o.value] ?? 0 })),
            { value: 'all', label: 'All batches', count: all },
        ];
    });

    /** The chip that matches the current filter. */
    get chipValue(): unknown {
        return this.status !== null ? this.status : this.openOnly ? 'open' : 'all';
    }

    resultText = computed(() => {
        const t = this.total();
        return t === 1 ? '1 batch' : `${t} batches`;
    });

    private total = signal(0);

    ngOnInit(): void {
        this.restoreList(this.pager, this, { status: 'number', openOnly: 'boolean', search: 'string' });
        this.load();
    }

    onSearch(value: string): void {
        this.search = value;
        this.pager.reset();
        this.load();
    }

    onStatus(value: unknown): void {
        this.status = typeof value === 'number' ? value : null;
        this.openOnly = value === 'open';
        this.pager.reset();
        this.load();
    }

    openRecord(id: string, event: Event): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('a, button, input, select, textarea, [role="button"]')) return;
        if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
        this.router.navigate(['/app/production/batches', id]);
    }

    async load(): Promise<void> {
        const request = ++this.loadRequest;
        this.failed.set(false);
        try {
            const [r, counts] = await Promise.all([
                this.api.get<any>('Batch', 'GetPage', {
                    status: this.status,
                    openOnly: this.openOnly,
                    search: this.search || undefined,
                    ...this.pager.params,
                }),
                // Status counts enrich the filter chips; the batch list remains useful without them.
                this.api.get<any[]>('Batch', 'GetStatusCounts', {
                    search: this.search || undefined,
                }).catch((e) => {
                    console.warn('Could not load batch status counts.', e);
                    return [];
                }),
            ]);
            if (request !== this.loadRequest) return;
            this.batches.set(r.items);
            this.total.set(r.totalCount);
            this.counts.set(Object.fromEntries((counts ?? []).map((x) => [x.status, x.count])));
            const reload = this.pager.update(r.totalCount);
            this.syncPager(this.pager);
            if (reload) {
                await this.load();
            }
        } catch (e) {
            if (request === this.loadRequest) {
                console.warn(e);
                this.failed.set(true);
            }
        }
    }
}
