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
    adgGPerDay: number | null;
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
            subtitle="Every pond with its batch, production indicators and latest water reading. The dashboard shows the short version.">
            @if (can('Farm.Ponds.Manage')) {
                <a routerLink="/app/ponds/new" class="fpms-button fpms-button-primary">Add pond</a>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (pondSummary(); as summary) {
                    <div class="fpms-grid-row fpms-space-bottom-3" aria-label="Pond summary">
                        <div class="fpms-col-6 fpms-col-lg-3 fpms-space-bottom-2"><div class="fpms-panel fpms-no-bottom fpms-height-full"><div class="fpms-panel-body fpms-space-y-2"><div class="fpms-stat-value fpms-no-bottom">{{ summary.total }}</div><div class="fpms-small fpms-muted">Ponds on record</div></div></div></div>
                        <div class="fpms-col-6 fpms-col-lg-3 fpms-space-bottom-2"><div class="fpms-panel fpms-no-bottom fpms-height-full"><div class="fpms-panel-body fpms-space-y-2"><div class="fpms-stat-value fpms-no-bottom">{{ summary.growOut }}</div><div class="fpms-small fpms-muted">Grow-out ponds</div></div></div></div>
                        <div class="fpms-col-6 fpms-col-lg-3 fpms-space-bottom-2"><div class="fpms-panel fpms-no-bottom fpms-height-full"><div class="fpms-panel-body fpms-space-y-2"><div class="fpms-stat-value fpms-no-bottom">{{ summary.inProduction }}</div><div class="fpms-small fpms-muted">In production</div></div></div></div>
                        <div class="fpms-col-6 fpms-col-lg-3 fpms-space-bottom-2"><div class="fpms-panel fpms-no-bottom fpms-height-full"><div class="fpms-panel-body fpms-space-y-2"><div class="fpms-stat-value fpms-no-bottom">{{ summary.areaHa | num: 2 }} ha</div><div class="fpms-small fpms-muted">Total pond area</div></div></div></div>
                    </div>
                }
                <section class="fpms-panel" aria-labelledby="pond-h">
                    <div class="fpms-panel-head">
                        <h2 id="pond-h" class="fpms-panel-title pd-h2">All ponds</h2>
                        <div class="fpms-small fpms-muted fpms-full-width fpms-space-bottom-2">
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
                        <div class="fpms-flex fpms-justify-end fpms-space-top-2" role="group" aria-label="Pond display">
                            <div class="fpms-button-group fpms-button-group-compact">
                                <button type="button" class="fpms-button" [class.fpms-button-primary]="viewMode() === 'table'" [class.fpms-button-secondary]="viewMode() !== 'table'" [attr.aria-pressed]="viewMode() === 'table'" (click)="setViewMode('table')">Table</button>
                                <button type="button" class="fpms-button" [class.fpms-button-primary]="viewMode() === 'tiles'" [class.fpms-button-secondary]="viewMode() !== 'tiles'" [attr.aria-pressed]="viewMode() === 'tiles'" (click)="setViewMode('tiles')">Tiles</button>
                            </div>
                        </div>
                    </div>
                    <div class="fpms-panel-body">
                        @if (!cards()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!cards()!.length) {
                            <fpms-empty
                                text="No ponds yet. Add your ponds before planning a production cycle."
                                icon="fas fa-water">
                                @if (can('Farm.Ponds.Manage')) {
                                    <a routerLink="/app/ponds/new" class="fpms-button fpms-button-compact fpms-button-primary">Add a pond</a>
                                }
                            </fpms-empty>
                        } @else if (f.noMatch()) {
                            <fpms-empty
                                text="No ponds match. Clear the search or the filter."
                                icon="fas fa-water"></fpms-empty>
                        } @else {
                            @if (viewMode() === 'table') {
                                <div class="fpms-table-scroll">
                                    <table class="fpms-data-table fpms-table-compact fpms-table-hover fpms-cell-middle fpms-no-bottom pd-table">
                                        <thead>
                                            <tr>
                                                <th scope="col" rowspan="2" class="pd-col-pond fpms-cell-middle">Pond</th>
                                                <th scope="col" rowspan="2" class="pd-col-status fpms-cell-middle">Status · batch</th>
                                                <th scope="colgroup" colspan="3" class="fpms-align-center">Production indicators</th>
                                            </tr>
                                            <tr>
                                                <th scope="col" class="pd-indicator-heading">ABW (g)</th>
                                                <th scope="col" class="pd-indicator-heading">ADG (g/day)</th>
                                                <th scope="col" class="pd-indicator-heading">FCR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (p of shownCards(); track p.id) {
                                                <tr
                                                    class="fpms-clickable-row"
                                                    [class.fpms-row-warning]="!!p.alert"
                                                    [class.fpms-muted]="p.archived"
                                                    tabindex="0"
                                                    role="link"
                                                    [attr.aria-label]="'Open pond ' + p.code"
                                                    (click)="openPondRow(p.id, $event)"
                                                    (keydown.enter)="openPondRow(p.id, $event)"
                                                    (keydown.space)="$event.preventDefault(); openPondRow(p.id, $event)">
                                                    <td class="pd-pond-cell">
                                                        <a [routerLink]="['/app/ponds', p.id]"><strong>{{ p.code }}</strong></a>
                                                        <div>{{ p.name }} · {{ p.areaM2 | num: 0 }} m²</div>
                                                        <div class="fpms-small fpms-muted">
                                                            {{ p.purpose | label: L.PondPurposes }} · {{ p.constructionType | label: L.ConstructionTypes }}
                                                            · {{ p.averageDepthM | num: 2 }} / {{ p.maxDepthM | num: 2 }} m
                                                        </div>
                                                        @if (p.isReserved) {
                                                            <div class="fpms-small fpms-warning-text">Reserved for {{ p.reservedByDelivery }}</div>
                                                        }
                                                    </td>
                                                    <td class="pd-status-cell">
                                                        <fpms-badge [text]="p.status | label: L.PondDisplayStatuses"></fpms-badge>
                                                        @if (p.batchId) {
                                                            <div class="fpms-space-top-1"><a [routerLink]="['/app/production/batches', p.batchId]">{{ p.batchCode }}</a></div>
                                                        } @else {
                                                            <div class="fpms-small fpms-muted fpms-space-top-1">No active batch</div>
                                                        }
                                                        @if (p.alert) {
                                                            <div class="fpms-small fpms-warning-text fpms-space-top-1">
                                                                <i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i>{{ p.alert }}
                                                                @if (p.alertLog) {
                                                                    <div><a [routerLink]="['/app/logbook', p.alertLog]">Open record</a></div>
                                                                }
                                                            </div>
                                                        }
                                                    </td>
                                                    <td class="pd-indicator-value">
                                                        @if (p.batchId) {
                                                            {{ p.abwG === null ? '—' : (p.abwG | num: 1) }}
                                                            <small class="fpms-block fpms-muted" [class.fpms-warning-text]="p.sampleDays === null || p.sampleDays > 14">{{ sampleText(p.sampleDays) }}</small>
                                                        } @else { <span class="fpms-muted">—</span> }
                                                    </td>
                                                    <td class="pd-indicator-value">
                                                        @if (p.batchId) {
                                                            {{ p.adgGPerDay === null ? '—' : (p.adgGPerDay | num: 3) }}
                                                        } @else { <span class="fpms-muted">—</span> }
                                                    </td>
                                                    <td class="pd-indicator-value">
                                                        @if (p.batchId) {
                                                            {{ p.fcr === null ? '—' : (p.fcr | num: 2) }}
                                                        } @else { <span class="fpms-muted">—</span> }
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
                                        <div class="fpms-flex fpms-justify-between fpms-align-start">
                                            <div>
                                                <a class="pd-code" [routerLink]="['/app/ponds', p.id]">{{ p.code }}</a>
                                                <div class="fpms-small fpms-muted">
                                                    {{ p.name }} · {{ p.areaM2 | num: 0 }} m²
                                                    <span class="fpms-block">{{ p.purpose | label: L.PondPurposes }} · {{ p.constructionType | label: L.ConstructionTypes }}</span>
                                                </div>
                                            </div>
                                            <div class="fpms-align-end"><fpms-badge [text]="p.status | label: L.PondDisplayStatuses"></fpms-badge>@if (p.isReserved) { <div class="fpms-small fpms-warning-text fpms-space-top-1">Reserved for {{ p.reservedByDelivery }}</div> }</div>
                                        </div>

                                        @if (p.batchId) {
                                            <div class="fpms-flex fpms-justify-between fpms-align-baseline fpms-space-top-2">
                                                <strong>{{ p.batchCode }}</strong>
                                                @if (p.doc !== null) {
                                                    <span class="fpms-small fpms-muted">DOC {{ p.doc }}</span>
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
                                                        [class.fpms-warning-text]="
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
                                                    <div class="fpms-small fpms-muted">None entered yet.</div>
                                                }
                                            </div>

                                            @if (p.strip.length) {
                                                <div class="pd-section">
                                                    <div class="l fpms-flex fpms-justify-between">
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
                                                        <div class="fpms-space-top-1">
                                                            @for (t of p.today; track t.label) {
                                                                <span class="pd-chip" [class.done]="t.done">
                                                                    {{ t.label }} {{ t.done ? '✓' : '–' }}
                                                                </span>
                                                            }
                                                            <span class="fpms-small fpms-muted">today</span>
                                                        </div>
                                                    }
                                                </div>
                                            }

                                            @if (p.alert) {
                                                <div class="pd-alertbox">
                                                    <div class="fpms-weight-bold">{{ p.alert }}</div>
                                                    @if (p.alertLog) {
                                                        <a
                                                            class="fpms-button fpms-button-compact fpms-button-secondary fpms-space-top-1"
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
                                                <div class="fpms-weight-bold">{{ note(p).title }}</div>
                                                <div class="fpms-small fpms-muted">{{ note(p).body }}</div>
                                            </div>
                                            <div class="pd-foot">
                                                <a [routerLink]="['/app/ponds', p.id]">Open pond</a>
                                                @if (p.status === 7 && can('Farm.Production.Stock')) {
                                                    <a
                                                        class="fpms-button fpms-button-compact fpms-button-primary"
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
                                <div class="fpms-align-center fpms-space-top-3">
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="showMore()">
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
        .fpms-button { display:inline-flex; align-items:center; justify-content:center; min-height:2.75rem; padding:var(--s2) var(--s4); border:1px solid var(--line); border-radius:var(--r-sm); font-weight:600; text-decoration:none; cursor:pointer; }
        .fpms-button-primary { color:var(--paper); background:var(--ink); border-color:var(--ink); }
        .fpms-button-secondary { color:var(--ink-2); background:var(--paper); border-color:var(--line); }
        .fpms-button-compact { min-height:2.5rem; padding:var(--s2) var(--s3); }
        .fpms-button-group { display:inline-flex; gap:var(--s1); }
        .fpms-button-group > button { border-radius:var(--r-sm); }
        .fpms-panel { min-width:0; background:var(--paper); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-sm); }
        .fpms-panel-head { padding:var(--s4) var(--s5); border-bottom:1px solid var(--line); }
        .fpms-panel-title { margin:0; color:var(--ink); font-size:1.15rem; font-weight:650; }
        .fpms-panel-body { padding:var(--s4) var(--s5); }
        .fpms-table-scroll { width:100%; overflow-x:auto; border:1px solid var(--line); border-radius:var(--r-md); background:var(--paper); }
        .fpms-data-table { width:100%; border-collapse:collapse; color:var(--ink-2); background:var(--paper); }
        .fpms-data-table th { padding:var(--s3) var(--s4); color:var(--muted); font-size:.82rem; font-weight:600; border-bottom:1px solid var(--line); }
        .fpms-data-table td { padding:var(--s3) var(--s4); border-top:1px solid var(--line); }
        .fpms-table-compact th,.fpms-table-compact td { padding:var(--s2) var(--s3); }
        .fpms-table-hover tbody tr:hover { background:var(--bg); }
        .fpms-row-warning { background:var(--orange-tint); }
        .fpms-cell-middle { vertical-align:middle; }
        .fpms-align-center { text-align:center; }
        .fpms-align-end { text-align:end; }
        .fpms-align-baseline { align-items:baseline; }
        .fpms-align-start { align-items:flex-start; }
        .fpms-justify-end { justify-content:flex-end; }
        .fpms-justify-between { justify-content:space-between; }
        .fpms-flex { display:flex; }
        .fpms-block { display:block; }
        .fpms-full-width { width:100%; }
        .fpms-nowrap { white-space:nowrap; }
        .fpms-muted { color:var(--muted); }
        .fpms-warning-text { color:var(--orange-deep); }
        .fpms-small { font-size:.875rem; }
        .fpms-stat-value { margin:0; font-size:1.5rem; line-height:1.25; font-weight:650; }
        .fpms-weight-bold { font-weight:700; }
        .fpms-icon-gap { margin-inline-end:var(--s1); }
        .fpms-space-top-1 { margin-top:var(--s1); }
        .fpms-space-top-2 { margin-top:var(--s2); }
        .fpms-space-top-3 { margin-top:var(--s3); }
        .fpms-space-bottom-2 { margin-bottom:var(--s2); }
        .fpms-space-bottom-3 { margin-bottom:var(--s3); }
        .fpms-space-y-2 { padding-block:var(--s2); }
        .fpms-no-bottom { margin-bottom:0; }
        @media (max-width:767px) { .fpms-panel-head,.fpms-panel-body { padding:var(--s3); } .fpms-data-table { min-width:47rem; } }

            .pd-h2 {
                float: none;
                font-size: 1.15rem;
            }
            .pd-table {
                width: 100%;
                min-width: 760px;
                table-layout: fixed;
            }
            .pd-table .pd-col-pond { width: 24%; }
            .pd-table .pd-col-status { width: 18%; }
            .pd-table .pd-indicator-heading { width: 19.33%; text-align: center; }
            .pd-table th {
                padding: 0.7rem 0.85rem;
                white-space: nowrap;
                font-size: 0.82rem;
                color: var(--fpms-muted);
                border-bottom: 1px solid var(--fpms-line-strong);
            }
            .pd-table td {
                padding: 0.8rem 0.85rem;
                vertical-align: middle;
                border-top-color: var(--fpms-line);
                overflow-wrap: anywhere;
            }
            .pd-pond-cell > div:first-of-type { font-weight: 600; }
            .pd-table .pd-indicator-value { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
            .pd-status-cell { white-space: normal; }
            .pd-indicators {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 0.4rem 0.85rem;
                align-items: start;
                font-size: 0.875rem;
            }
            .pd-indicators > span { min-width: 0; }
            .pd-indicators b {
                display: block;
                color: var(--fpms-muted);
                font-size: 0.75rem;
                font-weight: 600;
            }
            .pd-water-indicator > span { display: block; }
            .pd-water-indicator small { display: block; }
            @media (max-width: 1100px) {
                .pd-indicators { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
        const cards = this.cards();
        if (!cards) {
            return null;
        }
        const active = cards.filter((p) => !p.archived);
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
                    adgGPerDay: t?.adgGPerDay ?? null,
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

    openPondRow(id: string, event: Event): void {
        if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [role="button"]')) {
            return;
        }
        this.router.navigate(['/app/ponds', id]);
    }

    private isoDate(utc: string): string {
        return FarmTime.isoDateOf(utc);
    }
}
