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
                    class="fpms-button fpms-button-secondary"
                    (click)="
                        exportCsv('ExportList', {
                            list: 'Batches',
                            batchStatus: status,
                            openOnly: openOnly,
                            search: search || null,
                        })
                    "
                    [disabled]="busy()">
                    <i class="fas fa-file-csv fpms-icon-gap"></i>
                    Export CSV
                </button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
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
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-panel-flush fpms-table-scroll">
                        @if (!batches()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!batches().length) {
                            <fpms-empty
                                text="No batches match. Clear the search, or choose another status."
                                icon="fas fa-seedling">
                                @if (can('Farm.Production.Stock')) {
                                    <a routerLink="/app/production/create-batch" class="fpms-button fpms-button-compact fpms-button-primary">
                                        Stock a batch
                                    </a>
                                }
                            </fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <tr>
                                        <th scope="col" fpmsSort="pondCode" [pager]="pager" (sorted)="load()" title="The pond and batch, its cycle and its status">Batch</th>
                                        <th scope="col" fpmsSort="stockingDate" [pager]="pager" (sorted)="load()" title="Stocking date and PL stocked">Stocked</th>
                                        <th scope="col" class="fpms-align-end" title="Day of culture">DOC</th>
                                        <th scope="col" class="fpms-align-end">ABW (g)</th>
                                        <th scope="col" class="fpms-align-end">FCR</th>
                                        <th scope="col" class="fpms-align-end" title="Estimated survival">Survival</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (b of batches(); track b.id) {
                                        <tr>
                                            <td>
                                                <a class="fpms-nowrap" [routerLink]="['/app/production/batches', b.id]" [title]="b.batchCode"><span class="fpms-pond-tag">{{ b.pondCode }}</span> {{ batchShort(b.batchCode) }}</a>
                                                <div class="fpms-muted">Cycle <a [routerLink]="['/app/production/cycles', b.cycleId]">{{ unbroken(b.cycleCode) }}</a></div>
                                                <div class="fpms-space-top"><fpms-badge [text]="b.status | label: L.BatchStatuses"></fpms-badge></div>
                                            </td>
                                            <td class="fpms-nowrap">
                                                {{ b.stockingDate | farmDate }}
                                                <div class="fpms-muted">{{ b.plCountStocked | num: 0 }} PL</div>
                                            </td>
                                            <td class="fpms-align-end">{{ b.doc ?? '—' }}</td>
                                            <td class="fpms-align-end">{{ b.currentAbwG | num: 2 }}</td>
                                            <td class="fpms-align-end">{{ b.fcrToDate | num: 2 }}</td>
                                            <td class="fpms-align-end" [class.fpms-warning-text]="b.estimatedSurvivalPct > 100">
                                                @if (b.estimatedSurvivalPct !== null && b.estimatedSurvivalPct !== undefined) {
                                                    <span class="fpms-nowrap">{{ b.estimatedSurvivalPct | num: 1 }}%@if (b.estimatedSurvivalPct > 100) { <i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i> }</span>
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

    styles: [`
        .fpms-button {
            display: inline-flex; align-items: center; justify-content: center; gap: var(--s2);
            min-height: 2.75rem; padding: var(--s2) var(--s4); border: 1px solid var(--line);
            border-radius: var(--r-sm); font-weight: 600; text-decoration: none; cursor: pointer;
        }
        .fpms-button-primary { color: var(--paper); background: var(--ink); border-color: var(--ink); }
        .fpms-button-secondary { color: var(--ink-2); background: var(--paper); border-color: var(--line); }
        .fpms-button-compact { min-height: 2.5rem; padding: var(--s2) var(--s3); }
        .fpms-button:disabled { opacity: .58; cursor: not-allowed; }
        .fpms-icon-gap { margin-inline-end: var(--s1); }
        .fpms-panel { min-width: 0; overflow: hidden; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-sm); }
        .fpms-panel-body { padding: var(--s4); }
        .fpms-panel-flush { padding: 0; }
        .fpms-table-scroll { width: 100%; overflow-x: auto; }
        .fpms-data-table { width: 100%; border-collapse: collapse; color: var(--ink-2); background: var(--paper); }
        .fpms-data-table th { padding: var(--s3) var(--s4); color: var(--muted); text-align: start; white-space: nowrap; font-size: .875rem; font-weight: 600; border-bottom: 1px solid var(--line); }
        .fpms-data-table td { padding: var(--s3) var(--s4); border-top: 1px solid var(--line); vertical-align: middle; }
        .fpms-table-hover tbody tr:hover { background: var(--bg); }
        .fpms-align-end { text-align: end; }
        .fpms-nowrap { white-space: nowrap; }
        .fpms-muted { color: var(--muted); }
        .fpms-space-top { margin-top: var(--s1); }
        .fpms-no-bottom { margin-bottom: 0; }
        @media (max-width: 1023px) {
            .fpms-data-table { min-width: 46rem; }
        }
    `],
})
export class BatchesComponent extends FpmsPage implements OnInit {
    batches = signal<any[] | null>(null);
    counts = signal<Record<number, number>>({});
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

    async load(): Promise<void> {
        const [r, counts] = await Promise.all([
            this.api.get<any>('Batch', 'GetPage', {
                status: this.status,
                openOnly: this.openOnly,
                search: this.search || undefined,
                ...this.pager.params,
            }),
            this.api.get<any[]>('Batch', 'GetStatusCounts', {
                search: this.search || undefined,
            }),
        ]);
        this.batches.set(r.items);
        this.total.set(r.totalCount);
        this.counts.set(Object.fromEntries((counts ?? []).map((x) => [x.status, x.count])));
        const reload = this.pager.update(r.totalCount);
        this.syncPager(this.pager);
        if (reload) {
            await this.load();
        }
    }
}
