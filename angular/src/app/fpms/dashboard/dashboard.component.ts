import { Component, OnInit, computed, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { batchShort } from '@shared/fpms/labels';
import { FPMS_IMPORTS } from '../shared-imports';
import { CalendarCell, LOG_CALENDAR_STYLES, buildCalendarCells, shortDate } from '../log-calendar';

/** Days of squares on the dashboard; Daily log status shows up to 31 (DEC-96). */
const CALENDAR_DAYS = 7;

interface CalendarRow {
    batchId: string;
    pondId: string;
    pondCode: string;
    batchCode: string;
    cycleCode: string;
    cells: CalendarCell[];
    gapDates: string[];
    doc: number | null;
    abwG: number | null;
    fcr: number | null;
    survival: number | null;
    sampleDays: number | null;
    hasAlert: boolean;
    person: string;
    /** Each person who looks after the pond today (DEC-127), for the Technician filter. */
    people: string[];
    isMine: boolean;
}

interface AttentionRow {
    title: string;
    detail?: string;
    ownerOnly?: boolean;
    where: string;
    whereSub?: string;
    whereLink?: any[];
    since: string;
    action: string;
    actionLink: any[];
    actionParams?: any;
}

interface GlanceTile {
    key: string;
    label: string;
    main: string;
    sub: string;
    link: any[];
    linkText: string;
}

interface AttentionGroup {
    key: string;
    title: string;
    /** Shown when the group has nothing in it. */
    clear: string;
    icon: string;
    rows: AttentionRow[];
}

/**
 * Dashboard (Ref 9.2, DEC-96): what needs attention, then each pond's last seven days and its own figures. No farm
 * averages: an average of ponds stocked weeks apart, or of FCRs, describes no pond.
 * Everything is derived from what has been entered; a blank day is a gap to fill in, never "overdue" (DEC-31, DEC-50).
 */
/** Getting started is two steps: the farm profile, then the ponds. The rest is reachable from the menu when the farm needs it. */
const SETUP_STEPS = ['profile', 'ponds'];

@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (!d()) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @let x = d();

                    @if (x.isOwner && pendingSetup().length) {
                        <div class="card card-outline card-primary">
                            <div class="card-header">
                                <h3 class="card-title">
                                    <i class="fas fa-tasks" aria-hidden="true"></i>
                                    Set up your farm
                                </h3>
                                <span class="float-right text-muted">{{ doneSetup().length }} of {{ doneSetup().length + pendingSetup().length }} done</span>
                            </div>
                            <div class="card-body py-2">
                                <ul class="list-unstyled mb-0 fpms-setup">
                                    @for (t of pendingSetup(); track t.key) {
                                        <li>
                                            <i class="far fa-circle mr-2" aria-hidden="true"></i>
                                            <a [routerLink]="t.route">{{ t.label }}</a>
                                        </li>
                                    }
                                </ul>
                                @if (doneSetup().length) {
                                    <details class="fpms-setup-done mt-1">
                                        <summary class="text-muted">Show {{ doneSetup().length }} finished</summary>
                                        <ul class="list-unstyled mb-0 fpms-setup">
                                            @for (t of doneSetup(); track t.key) {
                                                <li>
                                                    <i class="far fa-check-circle text-success mr-2" aria-hidden="true"></i>
                                                    <span class="text-muted">{{ t.label }}</span>
                                                    <span class="sr-only">(done)</span>
                                                </li>
                                            }
                                        </ul>
                                    </details>
                                }
                            </div>
                        </div>
                    }

                    <!-- The page: farm at a glance and the ponds, with Needs attention beside them on a wide screen (DEC-102). -->
                    <div class="fpms-dash">
                    <div class="fpms-dash-main">

                    <!-- Farm at a glance: one tile per summary that has something to show (DEC-96). -->
                    @if (glance().length) {
                        <section class="fpms-glance" aria-labelledby="glance-h">
                            <h2 id="glance-h" class="fpms-section-h">Farm at a glance</h2>
                            <div class="fpms-glance-tiles">
                                @for (t of glance(); track t.key) {
                                    <a class="fpms-glance-tile" [routerLink]="t.link">
                                        <span class="l">{{ t.label }}</span>
                                        <span class="v">{{ t.main }}</span>
                                        <span class="s">{{ t.sub }}</span>
                                        <span class="go">{{ t.linkText }} <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
                                    </a>
                                }
                            </div>
                        </section>
                    }

                    @if (upcomingHarvests().length) {
                        <section class="fpms-upcoming" aria-labelledby="upcoming-h">
                            <div class="fpms-upcoming-head">
                                <div>
                                    <h2 id="upcoming-h" class="fpms-section-h mb-1">Upcoming harvests</h2>
                                    <p class="text-muted mb-0">Planning estimates for the next 30 days. Confirm readiness and withdrawal requirements before harvesting.</p>
                                </div>
                                <span class="fpms-upcoming-count">{{ upcomingHarvests().length }} batches</span>
                            </div>
                            <div class="fpms-upcoming-summary">
                                <div><span>Upcoming batches</span><strong>{{ upcomingHarvests().length }}</strong></div>
                                <div><span>Current estimated biomass</span><strong>{{ upcomingBiomass() | number:'1.0-1' }} kg</strong></div>
                                <div><span>Nearest date</span><strong>{{ shortDate(upcomingHarvests()[0].estimatedDate) }}</strong></div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm fpms-upcoming-table mb-0">
                                    <thead><tr><th scope="col">Pond / batch</th><th scope="col">Estimated date</th><th scope="col">DOC</th><th scope="col">ABW (g)</th><th scope="col">Estimated biomass</th></tr></thead>
                                    <tbody>
                                        @for (h of upcomingHarvests(); track h.batchId) {
                                            <tr>
                                                <td><a [routerLink]="['/app/production/batches', h.batchId]"><strong>{{ h.pondCode }}</strong><span class="d-block text-muted small">{{ batchShort(h.batchCode) }}</span></a></td>
                                                <td><strong>{{ shortDate(h.estimatedDate) }}</strong><span class="d-block text-muted small">{{ h.dateBasis }}</span></td>
                                                <td>{{ h.doc }}</td>
                                                <td>{{ h.currentAbwG === null ? '–' : (h.currentAbwG | num:1) }}<span class="text-muted small" *ngIf="h.targetAbwG"> / {{ h.targetAbwG | num:1 }} target</span></td>
                                                <td>{{ h.estimatedBiomassKg === null ? '–' : (h.estimatedBiomassKg | num:1) + ' kg' }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    } @else if (hasStockedBatches()) {
                        <section class="fpms-upcoming fpms-upcoming-empty" aria-labelledby="upcoming-h">
                            <h2 id="upcoming-h" class="fpms-section-h mb-1">Upcoming harvests</h2>
                            <p class="text-muted mb-0">No harvest estimates fall within the next 30 days. Estimates appear when a batch has a configured maximum culture duration.</p>
                        </section>
                    }

                    <!-- Ponds and log calendar (DEC-102): one row per pond, so a day reads down every pond. A row is the pond, its
                         last 7 days, then Day, ABW, FCR and survival; last sample and water status are on Daily log status. -->
                    <section class="fpms-ponds" aria-labelledby="cal-h">
                        <div class="fpms-ponds-head">
                            <h2 id="cal-h" class="fpms-section-h mb-0">Ponds</h2>
                            @if (can('Farm.Logs')) {
                                <a routerLink="/app/logbook/status" class="btn btn-outline-primary btn-sm">
                                    Proceed to Operations
                                    <i class="fas fa-arrow-right ml-1" aria-hidden="true"></i>
                                </a>
                            }
                        </div>
                        <div class="fpms-toolbar">
                            <label class="fpms-search">
                                <i class="fas fa-search" aria-hidden="true"></i>
                                <input
                                    type="text"
                                    aria-label="Search ponds or batches"
                                    placeholder="Search a pond, batch or cycle"
                                    [ngModel]="q()"
                                    (ngModelChange)="q.set($event)" />
                            </label>
                            <label class="fpms-sort">
                                <span>Sort by</span>
                                <select class="form-control form-control-sm" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
                                    <option value="pond">Pond code</option>
                                    <option value="attention">Needs attention first</option>
                                    <option value="doc">DOC, highest first</option>
                                    <option value="fcr">FCR, highest first</option>
                                </select>
                            </label>
                            @if (cycles().length > 1) {
                                <label class="fpms-sort">
                                    <span>Cycle</span>
                                    <select class="form-control form-control-sm" aria-label="Cycle" [ngModel]="cycle()" (ngModelChange)="cycle.set($event)">
                                        <option value="">All cycles</option>
                                        @for (c of cycles(); track c) {
                                            <option [value]="c">{{ c }}</option>
                                        }
                                    </select>
                                </label>
                            }
                            @if (showPeople()) {
                                <label class="fpms-sort">
                                    <span>Technician</span>
                                    <select class="form-control form-control-sm" aria-label="Technician" [ngModel]="person()" (ngModelChange)="person.set($event)">
                                        <option value="">Everyone</option>
                                        @for (p of people(); track p) {
                                            <option [value]="p">{{ p }}</option>
                                        }
                                        <option value="-">No one named</option>
                                    </select>
                                </label>
                            }
                            <div class="btn-group-toggle ml-auto" role="group" aria-label="Show">
                                <button type="button" class="fpms-chip" [attr.aria-pressed]="group() === 'all'" (click)="group.set('all')">All batches · {{ rows().length }}</button>
                                <button type="button" class="fpms-chip" [attr.aria-pressed]="group() === 'alert'" (click)="group.set('alert')">Alerts · {{ alertRows() }}</button>
                            </div>
                        </div>

                        <div class="fpms-pcal-panel">
                            @if (!s()) {
                                <fpms-loading></fpms-loading>
                            } @else if (!rows().length) {
                                <fpms-empty text="No batch is stocked yet." icon="fas fa-water">
                                    @if (can('Farm.Production.Stock')) {
                                        <a routerLink="/app/production/create-batch" class="btn btn-sm btn-primary">Stock a batch</a>
                                    }
                                </fpms-empty>
                            } @else {
                                <div class="fpms-pcal-scroll">
                                    <div class="fpms-pcal" role="table" aria-label="Ponds, their last 7 days and figures">
                                        <div class="fpms-pcal-row head" role="row">
                                            <div role="columnheader">Pond</div>
                                            @for (dd of dayHeads(); track dd.date) {
                                                <div role="columnheader" class="dh" [class.is-today]="dd.date === today">
                                                    <span class="n">{{ dd.n }}</span>
                                                    <span class="w">{{ dd.w }}</span>
                                                </div>
                                            }
                                            <div role="columnheader" class="r first-fig">Day</div>
                                            <div role="columnheader" class="r">ABW (g)</div>
                                            <div role="columnheader" class="r">FCR</div>
                                            <div role="columnheader" class="r">Survival</div>
                                        </div>
                                        @for (r of visible(); track r.batchId) {
                                            @let overCount = r.survival !== null && r.survival > 100;
                                            <div class="fpms-pcal-row" role="row" [class.is-alert]="r.hasAlert">
                                                <div class="pond" role="cell">
                                                    <a [routerLink]="['/app/production/batches', r.batchId]" [title]="r.batchCode">
                                                        <span class="fpms-pond-tag">{{ r.pondCode }}</span>
                                                        <span class="batch">{{ batchShort(r.batchCode) }}</span>
                                                    </a>
                                                    @if (r.cycleCode || r.hasAlert || r.person) {
                                                        <span class="cycle">
                                                            {{ r.cycleCode ? 'Cycle ' + r.cycleCode : '' }}
                                                            @if (r.person) { <span class="fpms-pcal-person">· {{ r.isMine ? 'You' : r.person }}</span> }
                                                            <!-- The water alert in words beside the gold edge; the status and last sample are on Daily log status. -->
                                                            @if (r.hasAlert) { <span class="fpms-pcal-tag"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i>Water alert</span> }
                                                        </span>
                                                    }
                                                </div>
                                                @for (c of r.cells; track c.date) {
                                                    <!-- A day opens that pond's Daily record on that day, as on Daily log status. -->
                                                    <div role="cell" class="day">
                                                        <a class="sq" [ngClass]="c.state" [class.is-today]="c.today" [title]="c.title" [attr.aria-label]="r.pondCode + ', ' + c.title"
                                                            [routerLink]="['/app/production/batches', r.batchId]" [queryParams]="{ tab: 'daily', date: c.date }">
                                                            {{ c.state === 'na' || c.state === 'today-empty' ? '' : c.count }}
                                                            @for (dt of c.dots; track dt.kind) {
                                                                <span class="dot" [ngClass]="'dot-' + dt.kind"></span>
                                                            }
                                                            @if (c.water !== 'na') { <span class="wq" [class.in]="c.water === 'in'" aria-hidden="true"></span> }
                                                        </a>
                                                    </div>
                                                }
                                                <div role="cell" class="r first-fig fig">{{ r.doc ?? '–' }}</div>
                                                <div role="cell" class="r fig">{{ r.abwG === null ? '–' : (r.abwG | num: 1) }}</div>
                                                <div role="cell" class="r fig">{{ r.fcr === null ? '–' : (r.fcr | num: 2) }}</div>
                                                <div role="cell" class="r fig" [class.warn]="overCount">
                                                    {{ r.survival === null ? '–' : (r.survival | num: 0) + '%' }}
                                                    @if (overCount) {
                                                        <span class="fpms-pcal-tag" title="Above 100%. Check the stocking count and the latest survival estimate."><i class="fas fa-exclamation-triangle" aria-hidden="true"></i>check count</span>
                                                    }
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                                @if (!visible().length) {
                                    <p class="text-muted px-4 py-3 mb-0">No pond matches. Clear the search or the filters.</p>
                                }
                                <div class="fpms-pcal-foot">
                                    <div class="fpms-legend">
                                        <span><i class="sq gap"></i>No feedings</span>
                                        <span><i class="sq c1"></i>Some feedings</span>
                                        <span><i class="sq c3"></i>All feedings</span>
                                        <span><i class="sq today-empty is-today"></i>Today</span>
                                        <span><i class="wq-key in"></i>Water tested</span>
                                        @if (hasWaterGaps()) {
                                            <span><i class="wq-key"></i>Water not tested</span>
                                        }
                                        <span><i class="dot-key dot-m"></i>Mortality</span>
                                        <span><i class="dot-key dot-g"></i>Growth sampling</span>
                                        <span><i class="dot-key dot-c"></i>Chemical</span>
                                    </div>
                                    <a routerLink="/app/logbook/status" class="text-nowrap">See the full status, up to 31 days<i class="fas fa-arrow-right ml-1" aria-hidden="true"></i></a>
                                </div>
                            }
                        </div>
                    </section>
                    </div>
                    <!-- Needs attention (DEC-102): beside the ponds on a wide screen, under them otherwise. One panel; each group with
                         something in it is a heading with its count that opens its to-do list; the most urgent opens by itself (DEC-96). -->
                    <aside class="fpms-dash-side">
                        <section class="fpms-att-panel" aria-labelledby="att-h" id="attention">
                            <h2 id="att-h" class="fpms-section-h">Needs attention</h2>
                            <div class="fpms-att-box">
                                @if (!attentionTotal()) {
                                    <p class="fpms-att-none mb-0"><i class="fas fa-check mr-2" aria-hidden="true"></i>Nothing needs attention: no water alerts or high mortality in the last 7 days, nothing missed before today, and stock and permits are in order.</p>
                                } @else {
                                    @for (g of allGroups(); track g.key) {
                                        @if (g.rows.length) {
                                            <div class="fpms-att-group" [ngClass]="'grp-' + g.key">
                                                <button
                                                    type="button"
                                                    class="fpms-att-gh"
                                                    [attr.aria-expanded]="openGroup() === g.key"
                                                    [attr.aria-controls]="'att-' + g.key"
                                                    (click)="toggleGroup(g.key)">
                                                    <i class="fas fa-fw" [ngClass]="g.icon" aria-hidden="true"></i>
                                                    <span class="t">{{ g.title }}</span>
                                                    <span class="c">{{ g.rows.length }}<span class="sr-only"> {{ g.rows.length === 1 ? 'item' : 'items' }}</span></span>
                                                    <i class="fas fa-chevron-down fpms-att-chev" aria-hidden="true"></i>
                                                </button>
                                                @if (openGroup() === g.key) {
                                                    <ul class="fpms-att-list" [id]="'att-' + g.key" [attr.aria-label]="g.title">
                                                        @for (r of g.rows; track $index) {
                                                            <li>
                                                                <div class="what">
                                                                    <strong>{{ r.title }}</strong>
                                                                    @if (r.ownerOnly) { <span class="badge badge-secondary ml-1">Owner</span> }
                                                                    <div class="where">
                                                                        @if (r.whereLink) { <a [routerLink]="r.whereLink">{{ r.where }}</a> } @else { {{ r.where }} }
                                                                        @if (r.since) { · {{ r.since }} }
                                                                    </div>
                                                                    @if (r.detail) { <div class="detail">{{ r.detail }}</div> }
                                                                </div>
                                                                <a class="btn btn-sm btn-outline-primary" [routerLink]="r.actionLink" [queryParams]="r.actionParams">{{ r.action }}</a>
                                                            </li>
                                                        }
                                                    </ul>
                                                } @else {
                                                    <p class="fpms-att-peek">{{ groupSummary(g) }}</p>
                                                }
                                            </div>
                                        }
                                    }
                                }
                            </div>
                        </section>
                    </aside>
                    </div>

                }
            </div>
        </section>
    `,
    styles: [
        LOG_CALENDAR_STYLES,
        `
            .fpms-h2 {
                float: none;
                margin: 0;
                font-size: 1.15rem;
                font-weight: 600;
                color: var(--ink);
            }
            .fpms-chip {
                min-height: 2.75rem;
                padding: 0 var(--s4);
                margin-left: var(--s2);
                border-radius: 999px;
                border: 1px solid var(--line);
                background: var(--bg);
                color: var(--ink);
                transition: background-color var(--fpms-motion) var(--fpms-ease), border-color var(--fpms-motion) var(--fpms-ease), color var(--fpms-motion) var(--fpms-ease);
                font-size: 0.9rem;
                cursor: pointer;
            }

            .fpms-chip:hover,
            .fpms-chip:focus-visible {
                background: var(--blue-tint);
                border-color: var(--ink);
                color: var(--ink-2);
            }
            .fpms-chip:focus-visible {
                outline: 2px solid var(--ink);
                outline-offset: 2px;
            }            .fpms-chip[aria-pressed='true'] {
                background: var(--ink);
                border-color: var(--ink);
                color: var(--paper);
            }
            .fpms-toolbar {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: var(--s2) var(--s4);
                margin-bottom: 0.9rem;
            }
            .fpms-search {
                display: flex;
                align-items: center;
                gap: var(--s2);
                min-height: 2.75rem;
                padding: 0 var(--s3);
                margin: 0;
                border: 1px solid var(--line);
                border-radius: var(--r-sm);
                background: var(--paper);
                flex: 1 1 220px;
                max-width: 320px;
                color: var(--muted);
            }
            .fpms-search input {
                border: 0;
                outline: 0;
                flex: 1;
                min-width: 0;
                background: transparent;
                color: var(--ink);
            }
            .fpms-sort {
                display: flex;
                align-items: center;
                gap: var(--s2);
                margin: 0;
                font-weight: 400;
                font-size: 0.9rem;
            }
            .fpms-sort select {
                height: 2.75rem;
                width: auto;
            }
            .fpms-upcoming {
                margin: 0 0 var(--s5);
                padding: var(--s4);
                border: 1px solid var(--line);
                border-radius: var(--r-lg);
                background: var(--paper);
            }
            .fpms-upcoming-head { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--s4); margin-bottom:var(--s3); }
            .fpms-upcoming-count { color:var(--muted); font-size:.85rem; white-space:nowrap; }
            .fpms-upcoming-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--s3); padding:var(--s3); margin-bottom:var(--s3); background:var(--bg); border-radius:var(--r-sm); }
            .fpms-upcoming-summary div { display:flex; flex-direction:column; gap:.15rem; min-width:0; }
            .fpms-upcoming-summary span { color:var(--muted); font-size:.78rem; }
            .fpms-upcoming-summary strong { color:var(--ink); font-size:1.05rem; }
            .fpms-upcoming-table { min-width:600px; }
            .fpms-upcoming-table th { color:var(--muted); font-size:.78rem; font-weight:600; white-space:nowrap; }
            .fpms-upcoming-table td { vertical-align:middle; }
            .fpms-upcoming-empty { padding:1rem; }
            @media (max-width: 575.98px) {
                .fpms-upcoming { padding:var(--s3); }
                .fpms-upcoming-summary { grid-template-columns:1fr 1fr; }
                .fpms-upcoming-summary div:last-child { grid-column:1 / -1; }
            }
        `,
    ],
})
export class DashboardComponent extends FpmsPage implements OnInit {
    d = signal<any>(null);
    s = signal<any>(null);
    pendingSetup = signal<any[]>([]);
    doneSetup = signal<any[]>([]);

    q = signal('');
    sort = signal<'pond' | 'attention' | 'doc' | 'fcr'>('pond');

    private readonly weekday = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    async ngOnInit(): Promise<void> {
        const [data, status] = await Promise.all([
            this.api.get<any>('Dashboard', 'Get'),
            this.can('Farm.Logs')
                ? this.run(() =>
                      this.api.get<any>('Feeding', 'GetDailyStatus', { endDate: this.today, days: CALENDAR_DAYS })
                  )
                : Promise.resolve(null),
        ]);
        const steps = (data?.setupTasks ?? []).filter((t: any) => SETUP_STEPS.includes(t.key));
        this.pendingSetup.set(steps.filter((t: any) => !t.done));
        this.doneSetup.set(steps.filter((t: any) => t.done));
        this.d.set(data);
        this.s.set(status ?? { rows: [] });
    }

    upcomingHarvests = computed<any[]>(() => {
        const rows = ((this.d()?.upcomingHarvests as any[]) ?? [])
            .filter(h => h.estimatedDate && String(h.estimatedDate).substring(0, 10) <= FarmTime.addDays(this.today, 30))
            .sort((a, b) => String(a.estimatedDate).localeCompare(String(b.estimatedDate)));
        return rows;
    });
    upcomingBiomass = computed(() => this.upcomingHarvests().reduce((sum, h) => sum + (h.estimatedBiomassKg ?? 0), 0));
    hasStockedBatches = computed(() => ((this.d()?.ponds as any[]) ?? []).some(p => p.doc !== null && p.doc !== undefined));

    // ---- calendar

    dates = computed<string[]>(() => {
        const out: string[] = [];
        for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
            out.push(FarmTime.addDays(this.today, -i));
        }
        return out;
    });

    dayHeads = computed(() =>
        this.dates().map((date) => {
            const [y, m, dd] = date.split('-').map(Number);
            return { date, n: String(dd), w: this.weekday[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] };
        })
    );

    rangeText = computed(() => {
        const ds = this.dates();
        return `${this.shortDate(ds[0])} to ${this.shortDate(ds[ds.length - 1])}`;
    });

    rows = computed<CalendarRow[]>(() => {
        const status = this.s();
        const dash = this.d();
        if (!status?.rows || !dash) {
            return [];
        }
        const tiles = new Map<string, any>((dash.ponds as any[]).filter((p) => p.batchId).map((p) => [p.batchId, p]));
        return (status.rows as any[]).map((r) => {
            const t = tiles.get(r.batchId);
            const { cells, gapDates } = buildCalendarCells(r, this.dates(), this.today);
            return {
                batchId: r.batchId,
                pondId: r.pondId,
                pondCode: r.pondCode,
                batchCode: r.batchCode,
                cycleCode: r.cycleCode ?? '',
                cells,
                gapDates,
                doc: t?.doc ?? null,
                abwG: t?.abwG ?? null,
                fcr: t?.fcrToDate ?? null,
                survival: t?.estimatedSurvivalPct ?? null,
                sampleDays: r.daysSinceGrowthSampling ?? null,
                hasAlert: !!t?.hasWaterQualityAlert,
                person: r.technicianName ?? '',
                people: r.technicianNames ?? (r.technicianName ? [r.technicianName] : []),
                isMine: !!r.isMine,
            };
        });
    });

    /** Filters on the ponds table: alerts only, and one cycle when several run at once. */
    group = signal<'all' | 'alert'>('all');
    cycle = signal<string>('');
    alertRows = computed(() => this.rows().filter((r) => r.hasAlert).length);
    cycles = computed(() => [...new Set(this.rows().map((r) => r.cycleCode).filter(Boolean))].sort());
    /** DEC-127: the Owner sees one technician's ponds at a time; '-' is the ponds with no one named. */
    person = signal<string>('');
    people = computed(() => [...new Set(this.rows().flatMap((r) => r.people))].sort());
    showPeople = computed(() => this.people().length > 1 || (this.people().length > 0 && this.rows().some((r) => !r.people.length)));

    visible = computed<CalendarRow[]>(() => {
        const q = this.q().trim().toLowerCase();
        const num = (v: number | null) => (v === null ? -1 : v);
        return this.rows()
            .filter(
                (r) =>
                    (this.group() === 'all' || r.hasAlert) &&
                    (!this.cycle() || r.cycleCode === this.cycle()) &&
                    (!this.person() || r.people.includes(this.person()) || (this.person() === '-' && !r.people.length)) &&
                    (!q || `${r.pondCode} ${r.batchCode} ${r.cycleCode} ${r.person}`.toLowerCase().includes(q))
            )
            .sort((a, b) => {
                switch (this.sort()) {
                    case 'attention':
                        return Number(b.hasAlert) - Number(a.hasAlert) || Number(b.isMine) - Number(a.isMine) || a.pondCode.localeCompare(b.pondCode);
                    case 'doc':
                        return num(b.doc) - num(a.doc);
                    case 'fcr':
                        return num(b.fcr) - num(a.fcr);
                    default:
                        return a.pondCode.localeCompare(b.pondCode);
                }
            });
    });

    resultText = computed(() =>
        this.visible().length
            ? `${this.visible().length} of ${this.rows().length} ponds`
            : 'No pond matches. Clear the search or the filters.'
    );

    /** Latest farm day on which any log was observed, as a plain statement of how current the data is. */
    enteredThrough = computed(() => {
        const logs = (this.d()?.recentLogs as any[]) ?? [];
        if (!logs.length) {
            return 'No entries yet.';
        }
        const latest = logs
            .map((l) => FarmTime.isoDateOf(l.observedAtUtc))
            .sort()
            .pop()!;
        return `Data entered through ${this.shortDate(latest)}`;
    });

    // ---- farm at a glance (DEC-96): fixed-size tiles that summarise; each links to its full page

    glance = computed<GlanceTile[]>(() => {
        const dash = this.d();
        if (!dash) {
            return [];
        }
        const tiles: GlanceTile[] = [];
        const fmt = (n: number) => n.toLocaleString('en-US');
        const names = (list: string[]) => (list.length <= 3 ? list.join(', ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`);

        const cycles = (dash.activeCycles as any[]) ?? [];
        if (cycles.length) {
            const ponds = cycles.reduce((n, c) => n + (c.stockedCount ?? 0), 0);
            const pl = cycles.reduce((n, c) => n + (c.plStocked ?? 0), 0);
            const starts = cycles.map((c) => c.startDate).filter(Boolean).sort();
            const oldest = starts.length ? Math.round((Date.parse(this.today) - Date.parse(starts[0])) / 86400000) : null;
            tiles.push({
                key: 'cycles',
                label: 'Active cycles',
                main: `${cycles.length} ${cycles.length === 1 ? 'cycle' : 'cycles'}`,
                sub: [`${ponds} ${ponds === 1 ? 'pond' : 'ponds'}`, `${fmt(pl)} PL stocked`, oldest !== null ? `${cycles.length === 1 ? 'day' : 'oldest at day'} ${oldest}` : '']
                    .filter(Boolean)
                    .join(' · '),
                link: cycles.length === 1 ? ['/app/production/cycles', cycles[0].id] : ['/app/production/cycles'],
                linkText: cycles.length === 1 ? 'Open cycle' : 'Open cycles',
            });
        }

        // One tile per pond status that has ponds in it; prepared ponds read as "Ready to stock".
        const statuses: { status: number; label: string; link: any[]; linkText: string; note?: string }[] = [
            { status: 3, label: 'Ponds in production', link: ['/app/ponds'], linkText: 'Open ponds' },
            { status: 7, label: 'Ready to stock', link: ['/app/production/create-batch'], linkText: 'Stock a batch', note: 'prepared' },
            { status: 2, label: 'Under preparation', link: ['/app/ponds'], linkText: 'Open ponds' },
            { status: 4, label: 'Post-harvest', link: ['/app/ponds'], linkText: 'Open ponds' },
            { status: 1, label: 'Available', link: ['/app/ponds'], linkText: 'Open ponds' },
            { status: 5, label: 'Under maintenance', link: ['/app/ponds'], linkText: 'Open ponds' },
        ];
        for (const st of statuses) {
            const codes = ((dash.ponds as any[]) ?? []).filter((p) => p.status === st.status).map((p) => p.pondCode);
            if (codes.length) {
                tiles.push({
                    key: 'pond' + st.status,
                    label: st.label,
                    main: `${codes.length} ${codes.length === 1 ? 'pond' : 'ponds'}`,
                    sub: names(codes) + (st.note ? ` · ${st.note}` : ''),
                    link: st.link,
                    linkText: st.linkText,
                });
            }
        }


        const fry = (dash.fryLeftToStock as any[]) ?? [];
        if (fry.length) {
            const left = fry.reduce((n, d) => n + Math.max(0, (d.plReceived ?? 0) - (d.plStocked ?? 0)), 0);
            const one = fry.length === 1 ? fry[0] : null;
            tiles.push({
                key: 'fry',
                label: 'Fry left to stock',
                main: `${fmt(left)} PL`,
                sub: one
                    ? `${one.hatcheryBatchNumber}, received ${String(one.deliveryDate).substring(0, 10) === this.today ? 'today' : this.shortDate(String(one.deliveryDate).substring(0, 10))}`
                    : `${fry.length} deliveries`,
                link: one ? ['/app/resources/fry-deliveries', one.id] : ['/app/resources/fry-deliveries'],
                linkText: one ? 'Open delivery' : 'Open fry deliveries',
            });
        }
        return tiles;
    });

    // ---- needs attention

    allGroups = computed<AttentionGroup[]>(() => {
        const dash = this.d();
        if (!dash) {
            return [];
        }
        const act: AttentionRow[] = [];
        for (const a of dash.waterQualityAlerts as any[]) {
            act.push({
                title: (a.readings as string[]).join('; '),
                detail: 'Water-quality reading outside the optimal range. See the recommendation in Farm Standards.',
                where: a.pondCode,
                whereSub: a.batchCode,
                whereLink: ['/app/production/batches', a.batchId],
                since: `Observed ${this.shortDate(String(a.farmDate).substring(0, 10))}`,
                action: 'Open log',
                actionLink: ['/app/logbook', a.logId],
            });
        }
        for (const h of (dash.harvestReadinessAlerts as any[]) ?? []) {
            act.push({
                title: `Ready for harvest: ${h.pondCode}`,
                detail: `DOC ${h.doc} and ABW ${Number(h.abwG).toFixed(2)} g meet this farm's targets.${h.earliestSafeHarvestDate && String(h.earliestSafeHarvestDate).substring(0, 10) > this.today ? ` Withdrawal period ends ${this.shortDate(String(h.earliestSafeHarvestDate).substring(0, 10))}.` : ''}`,
                where: h.pondCode,
                whereSub: h.batchCode,
                whereLink: ['/app/production/batches', h.batchId],
                since: `ABW sampled ${this.shortDate(String(h.sampleDate).substring(0, 10))}`,
                action: 'Open batch',
                actionLink: ['/app/production/batches', h.batchId],
            });
        }
        for (const h of dash.highMortality as any[]) {
            act.push({
                title: `High mortality: ${h.count} dead`,
                detail: 'More than 1% of the estimated population in one entry.',
                where: h.pondCode,
                whereSub: h.batchCode,
                whereLink: ['/app/production/batches', h.batchId],
                since: `Observed ${this.shortDate(String(h.farmDate).substring(0, 10))}`,
                action: 'Open log',
                actionLink: ['/app/logbook', h.logId],
            });
        }

        const catchUp: AttentionRow[] = [];
        for (const r of this.rows()) {
            if (!r.gapDates.length) {
                continue;
            }
            const first = r.gapDates[0];
            const listed = r.gapDates
                .slice(0, 3)
                .map((d) => this.shortDate(d))
                .join(', ');
            catchUp.push({
                title:
                    r.gapDates.length === 1
                        ? `No complete entry for ${listed}`
                        : `Missing entries on ${r.gapDates.length} days`,
                detail:
                    r.gapDates.length > 3
                        ? `${listed} and ${r.gapDates.length - 3} more.`
                        : r.gapDates.length > 1
                          ? `${listed}.`
                          : undefined,
                where: r.pondCode,
                whereSub: r.batchCode,
                whereLink: ['/app/production/batches', r.batchId],
                since: `Since ${this.shortDate(first)}`,
                action: this.can('Farm.Logs.Create') ? 'Open feeding sheet' : 'See daily status',
                actionLink: this.can('Farm.Logs.Create') ? ['/app/logbook/feeding'] : ['/app/logbook/status'],
                actionParams: this.can('Farm.Logs.Create') ? { batchId: r.batchId, date: first } : undefined,
            });
        }

        const admin: AttentionRow[] = [];
        // Stock alerts are one line: the farm buys feed per cycle, so several low lots are one task, not one each.
        const stock = dash.stockAlerts as any[];
        if (stock.length) {
            const names = stock.map((st) => `${st.itemName}${st.lotNumber ? ' lot ' + st.lotNumber : ''}`);
            const negative = stock.some((st) => st.kind === 'Negative');
            admin.push({
                title: stock.length === 1
                    ? `${negative ? 'Negative stock' : 'Low stock'}: ${names[0]}`
                    : `${stock.length} lots are low${negative ? ' or below zero' : ''}`,
                detail: stock.length === 1
                    ? `${stock[0].quantity} ${stock[0].unit} on record. Check stock before the next feeding day.`
                    : `${names.slice(0, 3).join(', ')}${stock.length > 3 ? ` and ${stock.length - 3} more` : ''}.`,
                where: 'Inventory',
                whereLink: ['/app/inventory'],
                since: '',
                action: 'Open inventory',
                actionLink: ['/app/inventory'],
            });
        }
        // Shrimp still unsold past the follow-up day (DEC-140): a reminder only; nothing is marked sold or used by the system.
        for (const u of (dash.unsoldFollowUps as any[]) ?? []) {
            admin.push({
                title: `Unsold shrimp: ${Number(u.unaccountedKg).toFixed(2)} kg from ${u.pondCode}`,
                detail: 'Record what happened to it: a later sale, staff use, given away, spoiled or another reason.',
                where: u.lotCode ?? u.batchCode,
                whereSub: u.pondCode,
                whereLink: ['/app/harvests', u.harvestId],
                since: `Follow up ${this.shortDate(String(u.followUpOn).substring(0, 10))}`,
                action: 'Open harvest',
                actionLink: ['/app/harvests', u.harvestId],
            });
        }
        for (const f of (dash.finishStocking as any[]) ?? []) {
            admin.push({
                title: 'Fry delivery with PL not stocked yet',
                detail: 'Record any PL not stocked, then finish stocking.',
                ownerOnly: true,
                where: f.hatcheryBatchNumber,
                whereSub: f.hatcheryName,
                whereLink: ['/app/resources/fry-deliveries', f.id],
                since: `Received ${this.shortDate(String(f.deliveryDate).substring(0, 10))}`,
                action: 'Finish stocking',
                actionLink: ['/app/resources/fry-deliveries', f.id],
            });
        }
        if (dash.isOwner) {
            for (const name of dash.missingRequiredDocuments as string[]) {
                admin.push({
                    title: `No active record for ${name}`,
                    detail: 'Required permit. Record it so compliance checks can pass.',
                    ownerOnly: true,
                    where: 'Permits and licenses',
                    whereSub: 'Farm',
                    whereLink: ['/app/farm/documents'],
                    since: 'Not recorded',
                    action: 'Record permit',
                    actionLink: ['/app/farm/documents'],
                });
            }
            for (const doc of dash.documentAlerts as any[]) {
                admin.push({
                    title: `${doc.categoryName}: ${doc.title}`,
                    detail: 'Permit is expiring or expired. Renewing archives the old record.',
                    ownerOnly: true,
                    where: 'Permits and licenses',
                    whereSub: 'Farm',
                    whereLink: ['/app/farm/documents'],
                    since: doc.expiryDate ? `Expires ${this.shortDate(String(doc.expiryDate).substring(0, 10))}` : '',
                    action: 'Renew permit',
                    actionLink: ['/app/farm/documents'],
                });
            }
        }

        return [
            { key: 'act', title: 'Act today', clear: 'No water alerts or high mortality in the last 7 days.', icon: 'fa-exclamation-triangle', rows: act },
            { key: 'catchup', title: 'Catch up on entry', clear: 'Nothing missed before today.', icon: 'fa-pen', rows: catchUp },
            { key: 'admin', title: 'Admin and supply', clear: 'Stock, permits and unsold shrimp are in order.', icon: 'fa-clock', rows: admin },
        ];
    });

    attentionTotal = computed(() => this.allGroups().reduce((n, g) => n + g.rows.length, 0));

    /** The group whose list is open: the one picked, else Act today when it has something. */
    picked = signal<string | null | undefined>(undefined);
    openGroup = computed(() => {
        const p = this.picked();
        return p !== undefined ? p : this.allGroups()[0]?.rows.length ? 'act' : this.allGroups().find((g) => g.rows.length)?.key ?? null;
    });

    toggleGroup(key: string): void {
        this.picked.set(this.openGroup() === key ? null : key);
    }

    /** One line under a group's count: its first item, and how many more. */
    groupSummary(g: AttentionGroup): string {
        const first = g.rows[0];
        const what = first.where && !first.title.includes(first.where) ? `${first.where}: ${first.title}` : first.title;
        return g.rows.length > 1 ? `${what}, and ${g.rows.length - 1} more` : what;
    }

    // ---- helpers

    shortDate = shortDate;

    /** "Batch B" from "2026-09-SNA-01-B"; the full code is in the tooltip. */
    batchShort = batchShort;

    /** The "not tested" key appears only when some day is missing a water reading the farm requires (DEC-94). */
    hasWaterGaps = computed(() => this.rows().some((r) => r.cells.some((c) => c.water === 'missing')));



}
