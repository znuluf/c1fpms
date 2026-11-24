import { Component, OnInit, computed, effect, signal, untracked } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { ClientListFilter } from '@shared/fpms/client-list';
import { FarmTime } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';
import { CalendarCell, LOG_CALENDAR_STYLES, buildCalendarCells, shortDate, feedingsOf } from '../log-calendar';

interface PondCard {
    id: string;
    code: string;
    name: string;
    areaM2: number;
    averageDepthM: number;
    maxDepthM: number;
    constructionType: number;
    purpose: number;
    status: number;
    archived: boolean;
    isReserved: boolean;
    reservedByDelivery: string | null;
    purposeLabel: string;
    batchId: string | null;
    batchCode: string | null;
    doc: number | null;
    abwG: number | null;
    fcr: number | null;
    survival: number | null;
    biomassKg: number | null;
    feedKg: number | null;
    sampleDays: number | null;
    water: { name: string; value: number; unit: string; bad: boolean }[];
    waterDate: string | null;
    strip: CalendarCell[];
    today: { label: string; done: boolean }[] | null;
    alert: string | null;
    alertLog: string | null;
}

/**
 * Ponds: one card per pond. A pond with an open batch shows its figures, latest water reading and the last seven days of
 * the log; a pond without one says what it is waiting for. Values are what has been entered so far, with the day each
 * was observed, never a live reading. Pond master data is edited on the pond's own page.
 */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header
            title="Ponds"
            subtitle="Every pond with its batch, latest water reading and log record. The dashboard shows the short version.">
            @if (can('Farm.Ponds.Manage')) {
                <a routerLink="/app/ponds/new" class="btn btn-primary">Add pond</a>
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                @if (pondSummary(); as summary) {
                    <div class="row mb-3" aria-label="Pond summary">
                        <div class="col-6 col-lg-3 mb-2"><div class="card mb-0 h-100"><div class="card-body py-2"><div class="h4 mb-0">{{ summary.total }}</div><div class="small text-muted">Active ponds</div></div></div></div>
                        <div class="col-6 col-lg-3 mb-2"><div class="card mb-0 h-100"><div class="card-body py-2"><div class="h4 mb-0">{{ summary.growOut }}</div><div class="small text-muted">Grow-out ponds</div></div></div></div>
                        <div class="col-6 col-lg-3 mb-2"><div class="card mb-0 h-100"><div class="card-body py-2"><div class="h4 mb-0">{{ summary.inProduction }}</div><div class="small text-muted">In production</div></div></div></div>
                        <div class="col-6 col-lg-3 mb-2"><div class="card mb-0 h-100"><div class="card-body py-2"><div class="h4 mb-0">{{ summary.areaHa | num: 2 }} ha</div><div class="small text-muted">Total pond area</div></div></div></div>
                    </div>
                }
                <section class="card" aria-labelledby="pond-h">
                    <div class="card-header">
                        <h2 id="pond-h" class="card-title pd-h2">All ponds</h2>
                        <div class="small text-muted w-100 mb-2">
                            Latest values from the sheets entered so far. Each value shows the day it was observed.
                        </div>
                        <fpms-list-toolbar
                            placeholder="Search by pond, purpose or batch"
                            [search]="f.search()"
                            [resultText]="f.resultText()"
                            [chips]="f.chips()"
                            [chip]="f.chip()"
                            (searchChange)="onSearch($event)"
                            (chipChange)="onChip($event)"></fpms-list-toolbar>
                        <div class="d-flex justify-content-end mt-2" role="group" aria-label="Pond display">
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn" [class.btn-primary]="viewMode() === 'table'" [class.btn-outline-secondary]="viewMode() !== 'table'" [attr.aria-pressed]="viewMode() === 'table'" (click)="setViewMode('table')">Table</button>
                                <button type="button" class="btn" [class.btn-primary]="viewMode() === 'tiles'" [class.btn-outline-secondary]="viewMode() !== 'tiles'" [attr.aria-pressed]="viewMode() === 'tiles'" (click)="setViewMode('tiles')">Tiles</button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        @if (!cards()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!cards()!.length) {
                            <fpms-empty
                                text="No ponds yet. Add your ponds before planning a production cycle."
                                icon="fas fa-water">
                                @if (can('Farm.Ponds.Manage')) {
                                    <a routerLink="/app/ponds/new" class="btn btn-sm btn-primary">Add a pond</a>
                                }
                            </fpms-empty>
                        } @else if (f.noMatch()) {
                            <fpms-empty
                                text="No ponds match. Clear the search or the filter."
                                icon="fas fa-water"></fpms-empty>
                        } @else {
                            @if (viewMode() === 'table') {
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover align-middle mb-0 pd-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Pond</th>
                                                <th scope="col">Purpose</th>
                                                <th scope="col">Construction</th>
                                                <th scope="col">Depth (avg / max)</th>
                                                <th scope="col">Status</th>
                                                <th scope="col">Batch</th>
                                                <th scope="col">DOC</th>
                                                <th scope="col">ABW</th>
                                                <th scope="col">FCR</th>
                                                <th scope="col">Est. survival</th>
                                                <th scope="col">Est. biomass</th>
                                                <th scope="col">Feed used</th>
                                                <th scope="col">Last sample</th>
                                                <th scope="col">Latest water</th>
                                                <th scope="col">Log, last 7 days</th>
                                                <th scope="col">Attention</th>
                                                <th scope="col">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (p of shownCards(); track p.id) {
                                                <tr [class.table-warning]="!!p.alert" [class.text-muted]="p.archived">
                                                    <td>
                                                        <a [routerLink]="['/app/ponds', p.id]"><strong>{{ p.code }}</strong></a>
                                                        <div class="small text-muted">{{ p.name }} · {{ p.areaM2 | num: 0 }} m²</div>
                                                        @if (p.isReserved) { <div class="small text-warning-dark">Reserved for {{ p.reservedByDelivery }}</div> }
                                                    </td>
                                                    <td>{{ p.purpose | label: L.PondPurposes }}</td>
                                                    <td>{{ p.constructionType | label: L.ConstructionTypes }}</td>
                                                    <td class="text-nowrap">{{ p.averageDepthM | num: 2 }} / {{ p.maxDepthM | num: 2 }} m</td>
                                                    <td><fpms-badge [text]="p.status | label: L.PondDisplayStatuses"></fpms-badge></td>
                                                    <td>@if (p.batchId) { <a [routerLink]="['/app/production/batches', p.batchId]">{{ p.batchCode }}</a> } @else { <span class="text-muted">—</span> }</td>
                                                    <td>{{ p.doc ?? '—' }}</td>
                                                    <td>{{ p.abwG === null ? '—' : (p.abwG | num: 1) + ' g' }}</td>
                                                    <td>{{ p.fcr === null ? '—' : (p.fcr | num: 2) }}</td>
                                                    <td>{{ p.survival === null ? '—' : (p.survival | num: 1) + '%' }}</td>
                                                    <td>{{ p.biomassKg === null ? '—' : (p.biomassKg | num: 1) + ' kg' }}</td>
                                                    <td>{{ p.feedKg === null ? '—' : (p.feedKg | num: 1) + ' kg' }}</td>
                                                    <td [class.text-warning-dark]="p.batchId && (p.sampleDays === null || p.sampleDays > 14)">{{ p.batchId ? sampleText(p.sampleDays) : '—' }}</td>
                                                    <td>
                                                        @if (p.water.length) {
                                                            @for (w of p.water; track w.name) {
                                                                <div class="text-nowrap" [class.text-warning-dark]="w.bad">{{ w.name }}: {{ w.value | num: 1 }} {{ w.unit }}@if (w.bad) { <strong>(out of range)</strong> }</div>
                                                            }
                                                            @if (p.waterDate) { <div class="small text-muted">Observed {{ p.waterDate }}</div> }
                                                        } @else { <span class="text-muted">—</span> }
                                                    </td>
                                                    <td>
                                                        @if (p.strip.length) {
                                                            <div class="pd-strip">
                                                                @for (c of p.strip; track c.date) {
                                                                    <a class="sq" [class.is-today]="c.today" [ngClass]="c.state" [title]="c.title" [attr.aria-label]="c.title" role="button" tabindex="0" (click)="openFeeding(p.batchId!, c.date)" (keydown.enter)="openFeeding(p.batchId!, c.date)">@if (c.water !== 'na') { <span class="wq" [class.in]="c.water === 'in'" aria-hidden="true"></span> }</a>
                                                                }
                                                            </div>
                                                            @if (p.today) {
                                                                <div class="small text-nowrap mt-1">
                                                                    @for (t of p.today; track t.label) { <span class="pd-chip" [class.done]="t.done">{{ t.label }} {{ t.done ? '✓' : '–' }}</span> }
                                                                </div>
                                                            }
                                                        } @else { <span class="text-muted">—</span> }
                                                    </td>
                                                    <td>
                                                        @if (p.alert) {
                                                            <span class="text-warning-dark">{{ p.alert }}</span>
                                                            @if (p.alertLog) { <div><a [routerLink]="['/app/logbook', p.alertLog]">Open log</a></div> }
                                                        } @else { <span class="text-muted">—</span> }
                                                    </td>
                                                    <td class="text-nowrap">
                                                        @if (p.batchId) { <a [routerLink]="['/app/production/batches', p.batchId]">Batch</a><span class="mx-1">·</span> }
                                                        <a [routerLink]="['/app/ponds', p.id]">Pond</a>
                                                        @if (!p.batchId && p.status === 7 && can('Farm.Production.Stock')) { <span class="mx-1">·</span><a routerLink="/app/production/create-batch">Stock</a> }
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            } @else {
                            <div class="pd-grid">
                                @for (p of shownCards(); track p.id) {
                                    <article class="pd-card" [class.pd-alert]="!!p.alert" [class.pd-archived]="p.archived">
                                        <div class="d-flex justify-content-between align-items-start">
                                            <div>
                                                <a class="pd-code" [routerLink]="['/app/ponds', p.id]">{{ p.code }}</a>
                                                <div class="small text-muted">
                                                    {{ p.name }} · {{ p.areaM2 | num: 0 }} m²
                                                    <span class="d-block">{{ p.purpose | label: L.PondPurposes }} · {{ p.constructionType | label: L.ConstructionTypes }}</span>
                                                </div>
                                            </div>
                                            <div class="text-right"><fpms-badge [text]="p.status | label: L.PondDisplayStatuses"></fpms-badge>@if (p.isReserved) { <div class="small text-warning-dark mt-1">Reserved for {{ p.reservedByDelivery }}</div> }</div>
                                        </div>

                                        @if (p.batchId) {
                                            <div class="d-flex justify-content-between align-items-baseline mt-2">
                                                <strong>{{ p.batchCode }}</strong>
                                                @if (p.doc !== null) {
                                                    <span class="small text-muted">DOC {{ p.doc }}</span>
                                                }
                                            </div>
                                            <div class="pd-stats">
                                                <div>
                                                    <div class="l">ABW</div>
                                                    <div class="v">
                                                        {{ p.abwG === null ? '–' : (p.abwG | num: 1) + ' g' }}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="l">FCR to date</div>
                                                    <div class="v">{{ p.fcr === null ? '–' : (p.fcr | num: 2) }}</div>
                                                </div>
                                                <div>
                                                    <div class="l">Est. survival</div>
                                                    <div class="v">
                                                        {{ p.survival === null ? '–' : (p.survival | num: 0) + '%' }}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="l">Est. biomass</div>
                                                    <div class="v">
                                                        {{
                                                            p.biomassKg === null ? '–' : (p.biomassKg | num: 0) + ' kg'
                                                        }}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="l">Last sample</div>
                                                    <div
                                                        class="v"
                                                        [class.text-warning-dark]="
                                                            p.sampleDays === null || p.sampleDays > 14
                                                        ">
                                                        {{ sampleText(p.sampleDays) }}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="l">Feed used</div>
                                                    <div class="v">
                                                        {{ p.feedKg === null ? '–' : (p.feedKg | num: 0) + ' kg' }}
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="pd-section">
                                                <div class="l">
                                                    Latest water reading
                                                    @if (p.waterDate) {
                                                        <span>· observed {{ p.waterDate }}</span>
                                                    }
                                                </div>
                                                @if (p.water.length) {
                                                    <div class="pd-water">
                                                        @for (w of p.water; track w.name) {
                                                            <div [class.bad]="w.bad">
                                                                <div class="l">{{ w.name }}</div>
                                                                <div class="v">{{ w.value | num: 1 }}</div>
                                                                <div class="u">
                                                                    {{ w.bad ? 'out of range' : w.unit }}
                                                                </div>
                                                            </div>
                                                        }
                                                    </div>
                                                } @else {
                                                    <div class="small text-muted">None entered yet.</div>
                                                }
                                            </div>

                                            @if (p.strip.length) {
                                                <div class="pd-section">
                                                    <div class="l d-flex justify-content-between">
                                                        <span>Log, last 7 days</span>
                                                        <span>{{ rangeText() }}</span>
                                                    </div>
                                                    <div class="pd-strip">
                                                        @for (c of p.strip; track c.date) {
                                                            <a
                                                                class="sq"
                                                                [class.is-today]="c.today"
                                                                [ngClass]="c.state"
                                                                [title]="c.title"
                                                                role="button"
                                                                tabindex="0"
                                                                (click)="openFeeding(p.batchId!, c.date)"
                                                                (keydown.enter)="openFeeding(p.batchId!, c.date)">@if (c.water !== 'na') { <span class="wq" [class.in]="c.water === 'in'" aria-hidden="true"></span> }</a>
                                                        }
                                                    </div>
                                                    @if (p.today) {
                                                        <div class="mt-1">
                                                            @for (t of p.today; track t.label) {
                                                                <span class="pd-chip" [class.done]="t.done">
                                                                    {{ t.label }} {{ t.done ? '✓' : '–' }}
                                                                </span>
                                                            }
                                                            <span class="small text-muted">today</span>
                                                        </div>
                                                    }
                                                </div>
                                            }

                                            @if (p.alert) {
                                                <div class="pd-alertbox">
                                                    <div class="font-weight-bold">{{ p.alert }}</div>
                                                    @if (p.alertLog) {
                                                        <a
                                                            class="btn btn-sm btn-outline-secondary mt-1"
                                                            [routerLink]="['/app/logbook', p.alertLog]">
                                                            Open log
                                                        </a>
                                                    }
                                                </div>
                                            }
                                            <div class="pd-foot">
                                                <a [routerLink]="['/app/production/batches', p.batchId]">Open batch</a>
                                                <a [routerLink]="['/app/ponds', p.id]">Open pond</a>
                                            </div>
                                        } @else {
                                            <div class="pd-note">
                                                <div class="font-weight-bold">{{ note(p).title }}</div>
                                                <div class="small text-muted">{{ note(p).body }}</div>
                                            </div>
                                            <div class="pd-foot">
                                                <a [routerLink]="['/app/ponds', p.id]">Open pond</a>
                                                @if (p.status === 7 && can('Farm.Production.Stock')) {
                                                    <a
                                                        class="btn btn-sm btn-primary"
                                                        routerLink="/app/production/create-batch">
                                                        Stock a batch
                                                    </a>
                                                }
                                            </div>
                                        }
                                    </article>
                                }
                            </div>
                            }
                            @if (f.visible().length > shownCards().length) {
                                <div class="text-center mt-3">
                                    <button type="button" class="btn btn-outline-secondary" (click)="showMore()">
                                        Show {{ pageSize }} more ({{ f.visible().length - shownCards().length | num: 0 }} not shown)
                                    </button>
                                </div>
                            }
                        }
                    </div>
                </section>
            </div>
        </section>
    `,
    styles: [
        LOG_CALENDAR_STYLES,
        `
            .pd-h2 {
                float: none;
                font-size: 1.15rem;
            }
            .pd-table {
                min-width: 1050px;
            }
            .pd-table th {
                white-space: nowrap;
                font-size: 0.82rem;
            }
            .pd-table td {
                vertical-align: middle;
            }
            .pd-archived {
                opacity: 0.7;
            }
            .pd-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
                gap: 1rem;
            }
            .pd-card {
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
                padding: 1rem 1.1rem;
                background: var(--fpms-surface);
                border: 1px solid var(--fpms-line);
                border-radius: var(--fpms-r-card);
            }
            .pd-card.pd-alert {
                border-color: var(--fpms-warn-line);
            }
            .pd-code {
                font-size: 1.15rem;
                font-weight: 600;
            }
            .pd-stats {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 0.5rem 0.75rem;
            }
            .l {
                font-size: 0.875rem;
                color: var(--fpms-muted);
            }
            .v {
                font-weight: 600;
                font-variant-numeric: tabular-nums;
            }
            .pd-section {
                padding-top: 0.5rem;
                border-top: 1px solid var(--fpms-line);
            }
            .pd-water {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
                gap: 0.4rem;
                margin-top: 0.25rem;
            }
            .pd-water > div {
                padding: 0.35rem 0.5rem;
                border: 1px solid var(--fpms-line);
                border-radius: 8px;
            }
            .pd-water > div.bad {
                background: var(--fpms-warn-bg);
                border-color: var(--fpms-warn-line);
                color: var(--fpms-warning-text);
            }
            .pd-water .u {
                font-size: 0.875rem;
                color: var(--fpms-muted);
            }
            .pd-water .bad .u {
                color: var(--fpms-warning-text);
            }
            .pd-strip {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 3px;
                margin-top: 0.25rem;
            }
            .pd-strip .sq {
                height: 16px;
            }
            .pd-chip {
                display: inline-block;
                margin: 0 0.3rem 0.2rem 0;
                padding: 0.1rem 0.55rem;
                border-radius: 10px;
                font-size: 0.875rem;
                font-weight: 600;
                background: var(--fpms-warn-bg);
                color: var(--fpms-warning-text);
            }
            .pd-chip.done {
                background: var(--fpms-success-50);
                color: var(--fpms-success);
            }
            .pd-alertbox {
                padding: 0.6rem 0.75rem;
                border-radius: 10px;
                background: var(--fpms-warn-bg);
                border: 1px solid var(--fpms-warn-line);
                color: var(--fpms-warning-text);
                font-size: 0.9rem;
            }
            .pd-note {
                flex: 1;
                padding: 0.75rem;
                border-radius: 10px;
                background: var(--fpms-bg);
            }
            .pd-foot {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: auto;
                font-size: 0.9rem;
            }
        `,
    ],
})
export class PondsComponent extends FpmsPage implements OnInit {
    /** The view choice is stored per signed-in user on this device, so shared tablets keep each person's preference. */
    readonly viewMode = signal<'table' | 'tiles'>('table');

    private viewPreferenceKey(): string {
        return `fpms.ponds.view.${this.session.userId ?? 'anonymous'}`;
    }

    setViewMode(mode: 'table' | 'tiles'): void {
        this.viewMode.set(mode);
        localStorage.setItem(this.viewPreferenceKey(), mode);
    }

    private restoreViewMode(): void {
        const saved = localStorage.getItem(this.viewPreferenceKey());
        this.viewMode.set(saved === 'tiles' ? 'tiles' : 'table');
    }

    /** Every pond, archived ones included. Archived ponds come last, so the working ponds stay at the top. */
    private readonly allCards = signal<PondCard[] | null>(null);
    cards = computed<PondCard[] | null>(() => {
        const all = this.allCards();
        return all && [...all.filter((c) => !c.archived), ...all.filter((c) => c.archived)];
    });
    /** Facility totals exclude archived ponds; production figures remain tied to the active batch. */
    pondSummary = computed(() => {
        const active = (this.cards() ?? []).filter((p) => !p.archived);
        return {
            total: active.length,
            growOut: active.filter((p) => p.purpose === 1).length,
            inProduction: active.filter((p) => p.status === 3).length,
            areaHa: active.reduce((sum, p) => sum + Number(p.areaM2 || 0), 0) / 10000,
        };
    });
    /** The cards are shown a page at a time, so a farm with very many ponds still opens quickly. */
    readonly pageSize = 24;
    private readonly limit = signal(this.pageSize);
    shownCards = computed(() => this.f.visible().slice(0, this.limit()));
    f = new ClientListFilter<PondCard>(
        () => this.cards(),
        (p) => [p.code, p.name, p.batchCode, p.purposeLabel],
        (p) => p.status,
        Object.entries(this.L.PondDisplayStatuses).map(([value, label]) => ({
            value: Number(value),
            label: label as string,
        })),
        'All ponds',
        ['pond', 'ponds']
    );
    private readonly range = signal('');
    rangeText = computed(() => this.range());

    /** Reloads the cards when something is saved in the log drawer beside them. */
    private readonly reloadOnDrawerSave = (() => {
        let first = true;
        return effect(() => {
            this.drawer.saved();
            if (first) {
                first = false;
                return;
            }
            untracked(() => void this.ngOnInit());
        });
    })();

    async ngOnInit(): Promise<void> {
        this.restoreViewMode();
        const dates: string[] = [];
        for (let i = 6; i >= 0; i--) {
            dates.push(FarmTime.addDays(this.today, -i));
        }
        this.range.set(`${shortDate(dates[0])} to ${shortDate(dates[6])}`);
        const [ponds, dash, status] = await Promise.all([
            this.api.get<any[]>('Pond', 'GetAll', { includeArchived: true }),
            this.can('Farm.Dashboard') ? this.api.get<any>('Dashboard', 'Get') : Promise.resolve(null),
            this.can('Farm.Logs')
                ? this.run(() => this.api.get<any>('Feeding', 'GetDailyStatus', { endDate: this.today, days: 7 }))
                : Promise.resolve(null),
        ]);
        const tiles = new Map<string, any>(((dash?.ponds as any[]) ?? []).map((t) => [t.pondId, t]));
        const rows = new Map<string, any>(((status?.rows as any[]) ?? []).map((r) => [r.batchId, r]));
        const alerts = new Map<string, any>(((dash?.waterQualityAlerts as any[]) ?? []).map((a) => [a.batchId, a]));
        this.allCards.set(
            ponds.map((p) => {
                const t = tiles.get(p.id);
                const row = t?.batchId ? rows.get(t.batchId) : null;
                const al = t?.batchId ? alerts.get(t.batchId) : null;
                const today = row
                    ? (row.days as any[]).find((d) => String(d.date).substring(0, 10) === this.today)
                    : null;
                return {
                    id: p.id,
                    code: p.pondCode,
                    name: p.name,
                    areaM2: p.areaM2,
                    averageDepthM: p.averageDepthM,
                    maxDepthM: p.maxDepthM,
                    constructionType: p.constructionType,
                    purpose: p.purpose,
                    status: p.status,
                    archived: !!p.isArchived,
                    isReserved: !!p.isReserved,
                    reservedByDelivery: p.reservedByDelivery ?? null,
                    purposeLabel: this.L.PondPurposes[p.purpose] ?? '',
                    batchId: t?.batchId ?? null,
                    batchCode: t?.batchCode ?? null,
                    doc: t?.doc ?? null,
                    abwG: t?.abwG ?? null,
                    fcr: t?.fcrToDate ?? null,
                    survival: t?.estimatedSurvivalPct ?? null,
                    biomassKg: t?.estimatedBiomassKg ?? null,
                    feedKg: t?.cumulativeFeedKg ?? null,
                    sampleDays: row?.daysSinceGrowthSampling ?? null,
                    water: ((t?.latestWater as any[]) ?? []).map((w) => ({
                        name: w.name,
                        value: w.value,
                        unit: w.unit,
                        bad: w.isOutOfRange,
                    })),
                    waterDate: t?.latestWaterObservedAtUtc ? shortDate(this.isoDate(t.latestWaterObservedAtUtc)) : null,
                    strip: row ? buildCalendarCells(row, dates, this.today).cells : [],
                    today: today
                        ? [
                              {
                                  label: `Feeding ${feedingsOf(today).filter((v) => v !== 0).length}/${feedingsOf(today).length}`,
                                  done: feedingsOf(today).every((v) => v !== 0),
                              },
                              { label: 'Water', done: today.water === 1 },
                          ]
                        : null,
                    alert: al ? (al.readings as string[])[0] : null,
                    alertLog: al ? al.logId : null,
                } as PondCard;
            })
        );
    }

    onSearch(value: string): void {
        this.f.search.set(value);
        this.limit.set(this.pageSize);
    }

    onChip(value: unknown): void {
        this.f.chip.set(value);
        this.limit.set(this.pageSize);
    }

    showMore(): void {
        this.limit.update((n) => n + this.pageSize);
    }

    /** What a pond without an open batch is waiting for. */
    note(p: PondCard): { title: string; body: string } {
        switch (p.status) {
            case 7:
                return { title: 'Ready for stocking', body: 'Marked prepared. Create a batch to stock it.' };
            case 2:
                return {
                    title: 'Preparation in progress',
                    body: 'Add the steps on the pond page and mark it prepared when it is ready.',
                };
            case 1:
                return {
                    title: 'Not in use',
                    body:
                        p.purpose === 1
                            ? 'Start a preparation round on the pond page to begin the next batch.'
                            : 'This pond is not used for growing shrimp.',
                };
            case 5:
                return {
                    title: 'Under maintenance',
                    body: 'Not available for stocking until the status is changed on the pond page.',
                };
            case 6:
                return { title: 'Inactive', body: 'Not used by the farm at the moment.' };
            case 8:
                return { title: 'Archived', body: 'Kept for the record. Open the pond page to restore it.' };
            default:
                return { title: 'No open batch', body: '' };
        }
    }

    openFeeding(batchId: string, date: string): void {
        this.drawer.open({ batchId, date });
    }

    sampleText(days: number | null): string {
        return days === null ? 'None yet' : days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
    }

    private isoDate(utc: string): string {
        return FarmTime.isoDateOf(utc);
    }
}
