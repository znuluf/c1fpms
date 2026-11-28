import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { printPage } from '@shared/fpms/print-page';
import { FPMS_IMPORTS } from '../shared-imports';

interface Sheet {
    short: string;
    key: string;
    title: string;
    columns: string[];
    rows: number;
}

/** Printable paper log sheets mirroring each logbook form (D-23 paper-then-enter fallback). */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Printable log sheets" subtitle="Print one sheet per pond, fill it in at the pond, and enter it later at a desk. Write the time you actually observed each entry.">
            @if (can('Farm.Harvests')) {
                <a routerLink="/app/harvests/blank-tally" class="fpms-button fpms-button-secondary fpms-icon-gap"><i class="fas fa-clipboard-list fpms-icon-gap" aria-hidden="true"></i>Blank harvest tally sheet</a>
            }
            <button class="fpms-button fpms-button-primary" (click)="print()"><i class="fas fa-print fpms-icon-gap"></i>Print</button>
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <div class="fpms-panel no-print">
                    <div class="fpms-panel-body">
                        <div class="fpms-space-bottom-3" role="group" aria-label="Sheet">
                            <button type="button" class="fpms-chip" [attr.aria-pressed]="selected === 'all'" (click)="selected = 'all'">All sheets</button>
                            @for (s of sheets; track s.key) {
                                <button type="button" class="fpms-chip" [attr.aria-pressed]="selected === s.key" (click)="selected = s.key">{{ s.short }}</button>
                            }
                        </div>
                        <div class="fpms-grid-row fpms-align-end-items">
                            <div class="fpms-field fpms-col-md-4">
                                <label for="pond">Pond</label>
                                <select id="pond" class="fpms-control" [(ngModel)]="pond">
                                    <option value="">Blank (write in)</option>
                                    @for (p of ponds; track p.id) {
                                        <option [value]="p.pondCode + (p.currentBatchCode ? ' · ' + p.currentBatchCode : '')">{{ p.pondCode }}{{ p.currentBatchCode ? ' · ' + p.currentBatchCode : '' }}</option>
                                    }
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                @for (s of visibleSheets(); track s.key) {
                    <div class="fpms-paper fpms-doc" [class.fpms-page-wide]="s.columns.length >= 8">
                        <div class="fpms-doc-head">
                            <div>
                                <div class="fpms-doc-farm">{{ session.tenant?.name }}</div>
                                <div class="fpms-small">Paper log: fill in at the pond, enter into FPMS afterwards</div>
                            </div>
                            <div class="fpms-align-end">
                                <div class="fpms-doc-title">{{ s.title }}</div>
                            </div>
                        </div>
                        <div class="fpms-doc-meta">
                            <div class="fpms-doc-fields">
                                <span>Pond / batch</span>
                                <div [class.blank]="!pond"><strong>{{ pond }}</strong></div>
                                <span>Date</span>
                                <div class="blank"></div>
                                <span>Sheet no.</span>
                                <div class="blank"></div>
                            </div>
                        </div>
                        @if (s.key === 'wq') {
                            <p class="fpms-small fpms-space-bottom-1">Optimal ranges (GAqP): @for (p of params; track p.code) { <span class="fpms-icon-gap"><b>{{ p.name }}</b> {{ p.optimalRange }} ({{ p.guidanceFrequency }})</span> }</p>
                        }
                        <div class="fpms-table-scroll">
                        <table class="fpms-data-table fpms-table-bordered fpms-table-compact fpms-paper-table">
                            <thead>
                                <tr>
                                    @for (c of s.columns; track c) {
                                        <th scope="col">{{ c }}</th>
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                @for (r of rowsOf(s); track r) {
                                    <tr>
                                        @for (c of s.columns; track c) {
                                            <td>&nbsp;</td>
                                        }
                                    </tr>
                                }
                            </tbody>
                        </table>
                        </div>
                        <div class="fpms-small fpms-flex fpms-justify-between">
                            <span>Recorded by: <span class="fpms-blank"></span></span>
                            <span>Entered into FPMS on: <span class="fpms-blank"></span> by <span class="fpms-blank"></span></span>
                        </div>
                    </div>
                }
            </div>
        </section>
    `,
})
export class LogSheetsComponent extends FpmsPage implements OnInit {
    /** A4 page with page numbers; sheets with eight or more columns print on landscape. */
    protected readonly page = printPage('fpms-logsheet-page', 'FPMS paper log');

    ponds: any[] = [];
    params: any[] = [];
    selected = 'all';
    pond = '';

    sheets: Sheet[] = [
        // DEC-61: one column per feeding in the farm's schedule, like the farm's own logbook (feed and kg in each cell).
        { key: 'feeding', short: 'Feeding', title: 'Feeding log', columns: ['Date', 'DOC', 'Feeding 1', 'Feeding 2', 'Feeding 3', 'Feeding 4', 'Remarks'], rows: 14 },
        { key: 'wq', short: 'Water quality', title: 'Water quality log', columns: ['Time', 'DO (ppm)', 'Temp (°C)', 'pH', 'Salinity (ppt)', 'TAN (ppm)', 'Nitrite (ppm)', 'Nitrate (ppm)', 'Alkalinity (ppm)', 'Notes'], rows: 12 },
        { key: 'growth', short: 'Growth sampling', title: 'Growth sampling log', columns: ['Date / time', 'Sample size (pcs)', 'Total weight (g)', 'ABW (g)', 'Notes'], rows: 10 },
        { key: 'chemical', short: 'Chemical and supplement', title: 'Chemical and supplement application log', columns: ['Date / time', 'Product', 'Lot', 'Quantity (unit)', 'Reason', 'Notes'], rows: 10 },
        { key: 'mortality', short: 'Mortality', title: 'Mortality log', columns: ['Date / time', 'Count', 'Cause (Disease / Water quality / Other)', 'Disease name or other cause', 'Symptoms', 'Action taken'], rows: 10 },
        { key: 'prep', short: 'Pond preparation', title: 'Pond preparation log', columns: ['Date / time', 'What was done (description)', 'Recorded by'], rows: 10 },
    ];

    async ngOnInit(): Promise<void> {
        const [ponds, params] = await Promise.all([this.api.get<any[]>('Pond', 'GetAll'), this.api.get<any[]>('Log', 'GetParameters')]);
        this.ponds = ponds.filter((p) => p.purpose === 1 && p.manualStatus !== 3);
        this.params = params.filter((p) => p.isActive && p.optimalRange);
        // DEC-61: one column per feeding in the farm's schedule (the default four if the schedule cannot be read).
        try {
            const profile = await this.api.get<any>('FarmProfile', 'Get');
            const times = String(profile?.feedingTimes ?? '').split(',').map((t) => t.trim()).filter((t) => t);
            const feeding = this.sheets.find((x) => x.key === 'feeding');
            if (feeding && times.length) {
                feeding.columns = ['Date', 'DOC', ...times.map((t, i) => `Feeding ${i + 1} (${t})`), 'Remarks'];
            }
        } catch {
            // keep the default columns
        }
        const sheet = this.query('sheet');
        if (sheet && this.sheets.some((s) => s.key === sheet)) {
            this.selected = sheet;
        }
    }

    visibleSheets(): Sheet[] {
        return this.selected === 'all' ? this.sheets : this.sheets.filter((s) => s.key === this.selected);
    }

    rowsOf(s: Sheet): number[] {
        return Array.from({ length: s.rows }, (_, i) => i);
    }
}
