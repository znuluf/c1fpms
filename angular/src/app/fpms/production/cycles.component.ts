import { Component, OnInit, computed, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { PagerState } from '@shared/fpms/pager';
import { FPMS_IMPORTS } from '../shared-imports';
import { ToolbarChip } from '@shared/fpms/ui';
import { unbroken } from '@shared/fpms/labels';

/** Production cycles (Ref 5.1). A cycle starts from one fry delivery through Create Batch (Stocking). */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header
            title="Production cycles"
            subtitle="Each cycle holds the batches stocked from one fry delivery.">
            @if (can('Farm.Reports')) {
                <button
                    class="fpms-button fpms-button-secondary"
                    (click)="exportCsv('ExportList', { list: 'Cycles', cycleStatus: status, search: search || null })"
                    [disabled]="busy()">
                    <i class="fas fa-file-csv fpms-icon-gap"></i>
                    Export CSV
                </button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <!-- Filters on the page ground, the list in one panel; five columns so the list fits 1,000 px (DEC-112). -->
                <div class="fpms-list-filters">
                    <fpms-list-toolbar
                        placeholder="Search by cycle, hatchery or hatchery lot"
                        [search]="search"
                        [resultText]="resultText()"
                        [chips]="chips()"
                        [chip]="status"
                        (searchChange)="onSearch($event)"
                        (chipChange)="onStatus($event)"></fpms-list-toolbar>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!cycles()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!cycles().length) {
                            <fpms-empty
                                [text]="
                                    search || status !== null
                                        ? 'No cycles match. Clear the search or the filter.'
                                        : 'No production cycles yet. Record a fry delivery, prepare a pond, then use Stock a batch.'
                                "
                                icon="fas fa-sync"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <tr>
                                        <th scope="col" fpmsSort="cycleCode" [pager]="pager" (sorted)="load()" title="The cycle, and the hatchery and delivery it was stocked from">Cycle</th>
                                        <th scope="col" fpmsSort="startDate" [pager]="pager" (sorted)="load()">Started</th>
                                        <th scope="col" class="fpms-align-end" fpmsSort="plStocked" [pager]="pager" (sorted)="load()">PL stocked</th>
                                        <th scope="col" class="fpms-align-end">Batches</th>
                                        <th scope="col" fpmsSort="status" [pager]="pager" (sorted)="load()">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (c of cycles(); track c.id) {
                                        <tr>
                                            <td>
                                                <a class="fpms-nowrap" [routerLink]="['/app/production/cycles', c.id]">{{ unbroken(c.cycleCode) }}</a>
                                                <div class="fpms-muted"><span [title]="c.hatcheryName">{{ c.hatcheryShortCode || c.hatcheryName }}</span> · {{ c.hatcheryBatchNumber }}</div>
                                            </td>
                                            <td class="fpms-nowrap">
                                                @if (c.startDate) { {{ c.startDate | farmDate }} } @else { <span class="fpms-muted">Not stocked yet</span> }
                                            </td>
                                            <td class="fpms-align-end">
                                                {{ c.plStocked | num: 0 }}
                                                <div class="fpms-muted fpms-nowrap">of {{ c.plReceived | num: 0 }} received</div>
                                            </td>
                                            <td class="fpms-align-end fpms-nowrap">
                                                {{ c.batchCount }}
                                                <div class="fpms-muted">{{ c.openBatchCount }} open</div>
                                            </td>
                                            <td><fpms-badge [text]="c.status | label: L.CycleStatuses"></fpms-badge></td>
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
export class CyclesComponent extends FpmsPage implements OnInit {
    cycles = signal<any[] | null>(null);
    counts = signal<Record<number, number>>({});
    total = signal(0);
    status: number | null = null;
    search = '';
    pager = new PagerState('default');
    readonly unbroken = unbroken;

    chips = computed<ToolbarChip[]>(() => {
        const c = this.counts();
        const all = (Object.values(c) as number[]).reduce((n, v) => n + v, 0);
        return [
            { value: null, label: 'All statuses', count: all },
            ...this.Options.cycleStatus.map((o: any) => ({ value: o.value, label: o.label, count: c[o.value] ?? 0 })),
        ];
    });

    resultText = computed(() => (this.total() === 1 ? '1 cycle' : `${this.total()} cycles`));

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
            this.api.get<any>('Cycle', 'GetPage', { status: this.status, ...q, ...this.pager.params }),
            this.api.get<any[]>('Cycle', 'GetStatusCounts', q),
        ]);
        this.cycles.set(r.items);
        this.total.set(r.totalCount);
        this.counts.set(Object.fromEntries((counts ?? []).map((x) => [x.status, x.count])));
        const reload = this.pager.update(r.totalCount);
        this.syncPager(this.pager);
        if (reload) {
            await this.load();
        }
    }
}
