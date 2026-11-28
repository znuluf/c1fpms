import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';

/**
 * Farm Standards (DEC-58): the values entries are judged against. Each row shows the standard default and its source;
 * the Owner can set the farm's own value ("differs from standard") or reset it. Changes apply to new entries only;
 * readings and stockings already saved keep the flag they were given. Technicians can read this page.
 */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header [narrow]="true" title="Farm standards" subtitle="Water-quality ranges, density ranges and warning thresholds this farm uses."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner fpms-narrow">
                @if (!s()) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @let x = s();
                    <div class="fpms-alert fpms-alert-neutral fpms-border">
                        <i class="fas fa-info-circle fpms-icon-gap"></i>Defaults come from PNS/BAFS 197:2025 and the team's defaults (marked †, to be confirmed with the partner farm).
                        A farm value applies to new entries only; earlier readings and stockings keep the flag they were given. Nothing here blocks saving: values outside a range only warn.
                        @if (x.canEdit) {
                            <div class="fpms-space-top-2">
                                @if (x.reviewedAtUtc) {
                                    <span class="fpms-success"><i class="fas fa-check fpms-icon-gap"></i>Reviewed {{ x.reviewedAtUtc | farmDateTime }}.</span>
                                } @else {
                                    <button class="fpms-button fpms-button-compact fpms-button-outline" [disabled]="busy()" (click)="markReviewed()">I have reviewed these standards</button>
                                }
                            </div>
                        }
                    </div>

                    <div class="fpms-panel">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Water-quality ranges</h3></div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom fpms-standards">
                                <thead><tr><th>Parameter</th><th>Standard</th><th title="The farm's own minimum">Farm min.</th><th title="The farm's own maximum">Farm max.</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (p of x.parameters; track p.code) {
                                        <tr>
                                            <td>{{ p.name }} <span class="fpms-muted">{{ p.unit }}</span>
                                                @if (p.differs || (x.canEdit && parameterDirty(p))) {
                                                    <div class="fpms-badge-stack fpms-space-top-1">
                                                        @if (p.differs) { <fpms-badge text="Differs from standard" tone="info"></fpms-badge> }
                                                        @if (x.canEdit && parameterDirty(p)) { <span class="fpms-warning-text"><i class="fas fa-pen fpms-icon-gap" aria-hidden="true"></i>Unsaved</span> }
                                                    </div>
                                                }
                                            </td>
                                            <td>{{ p.standardRange }}@if (p.source !== commonSource(x.parameters)) { <div class="fpms-muted">{{ p.source }}</div> }</td>
                                            <td><input type="number" step="any" class="fpms-control fpms-control-compact" [(ngModel)]="edit[p.code].min" [disabled]="!x.canEdit" [attr.aria-label]="p.name + ' farm minimum'" [placeholder]="p.standardMin ?? 'none'" /></td>
                                            <td><input type="number" step="any" class="fpms-control fpms-control-compact" [(ngModel)]="edit[p.code].max" [disabled]="!x.canEdit" [attr.aria-label]="p.name + ' farm maximum'" [placeholder]="p.standardMax ?? 'none'" /></td>
                                            <td class="fpms-align-end">
                                                @if (x.canEdit) {
                                                    <div class="fpms-actions-stack">
                                                        <button class="fpms-button fpms-button-compact fpms-button-primary" [disabled]="busy() || !parameterDirty(p)" (click)="saveParameter(p)">Save</button>
                                                        @if (p.differs) { <button class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy()" (click)="resetParameter(p)">Reset to standard</button> }
                                                    </div>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        @if (commonSource(x.parameters); as src) {
                            <div class="fpms-panel-foot fpms-muted">Standard values: {{ src }}, unless a row says otherwise.</div>
                        }
                    </div>

                    <div class="fpms-panel">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Stocking density ranges (PL/m²)</h3></div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom fpms-standards">
                                <thead><tr><th title="Farming system and pond construction">System</th><th>Standard</th><th title="The farm's own minimum">Farm min.</th><th title="The farm's own maximum">Farm max.</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (b of x.densityBands; track bandKey(b)) {
                                        <tr>
                                            <td>{{ b.farmingSystem | label: L.FarmingSystems }}<div class="fpms-muted">{{ b.constructionType | label: L.ConstructionTypes }}</div>
                                                @if (b.differs || (x.canEdit && bandDirty(b))) {
                                                    <div class="fpms-badge-stack fpms-space-top-1">
                                                        @if (b.differs) { <fpms-badge text="Differs from standard" tone="info"></fpms-badge> }
                                                        @if (x.canEdit && bandDirty(b)) { <span class="fpms-warning-text"><i class="fas fa-pen fpms-icon-gap" aria-hidden="true"></i>Unsaved</span> }
                                                    </div>
                                                }
                                            </td>
                                            <td>
                                                @if (b.standardMin == null && b.standardMax == null) {
                                                    <span class="fpms-muted">None in the national standard</span>
                                                    @if (!b.differs) { <div class="fpms-warning-text"><i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i>Set the farm's own; until then densities are not checked.</div> }
                                                } @else {
                                                    {{ b.standardMin ?? '—' }}–{{ b.standardMax ?? '—' }}@if (b.source !== commonSource(x.densityBands)) { <div class="fpms-muted">{{ b.source }}</div> }
                                                }
                                            </td>
                                            <td><input type="number" min="0" step="any" class="fpms-control fpms-control-compact" [(ngModel)]="bandEdit[bandKey(b)].min" [disabled]="!x.canEdit" aria-label="Farm minimum" [placeholder]="b.standardMin ?? ''" /></td>
                                            <td><input type="number" min="0" step="any" class="fpms-control fpms-control-compact" [(ngModel)]="bandEdit[bandKey(b)].max" [disabled]="!x.canEdit" aria-label="Farm maximum" [placeholder]="b.standardMax ?? ''" /></td>
                                            <td class="fpms-align-end">
                                                @if (x.canEdit) {
                                                    <div class="fpms-actions-stack">
                                                        <button class="fpms-button fpms-button-compact fpms-button-primary" [disabled]="busy() || !bandDirty(b)" (click)="saveBand(b)">Save</button>
                                                        @if (b.differs) { <button class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy()" (click)="resetBand(b)">Reset to standard</button> }
                                                    </div>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        @if (commonSource(x.densityBands); as src) {
                            <div class="fpms-panel-foot fpms-muted">Standard values: {{ src }}, unless a row says otherwise.</div>
                        }
                    </div>

                    <div class="fpms-panel">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Warning thresholds</h3></div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom fpms-standards">
                                <thead><tr><th>Warn when</th><th>Standard</th><th>Farm value</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (t of x.thresholds; track t.code) {
                                        <tr>
                                            <td>{{ t.name }}<div class="fpms-muted">Allowed {{ t.min }}–{{ t.max }} {{ t.unit }}</div>
                                                @if (t.differs || (x.canEdit && thresholdDirty(t))) {
                                                    <div class="fpms-badge-stack fpms-space-top-1">
                                                        @if (t.differs) { <fpms-badge text="Differs from standard" tone="info"></fpms-badge> }
                                                        @if (x.canEdit && thresholdDirty(t)) { <span class="fpms-warning-text"><i class="fas fa-pen fpms-icon-gap" aria-hidden="true"></i>Unsaved</span> }
                                                    </div>
                                                }
                                            </td>
                                            <td>{{ t.default }} {{ t.unit }}@if (t.source !== commonSource(x.thresholds)) { <div class="fpms-muted">{{ t.source }}</div> }</td>
                                            <td style="width: 9rem">
                                                <div class="input-group input-group-sm">
                                                    <input type="number" step="any" [min]="t.min" [max]="t.max" class="fpms-control" [(ngModel)]="thresholdEdit[t.code]" [disabled]="!x.canEdit" [attr.aria-label]="t.name" [placeholder]="t.default" />
                                                    <div class="input-group-append"><span class="input-group-text">{{ t.unit }}</span></div>
                                                </div>
                                            </td>
                                            <td class="fpms-align-end">
                                                @if (x.canEdit) {
                                                    <div class="fpms-actions-stack">
                                                        <button class="fpms-button fpms-button-compact fpms-button-primary" [disabled]="busy() || thresholdEdit[t.code] == null || !thresholdDirty(t)" (click)="saveThreshold(t)">Save</button>
                                                        @if (t.differs) { <button class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy()" (click)="resetThreshold(t)">Reset to standard</button> }
                                                    </div>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        @if (commonSource(x.thresholds); as src) {
                            <div class="fpms-panel-foot fpms-muted">Standard values: {{ src }}, unless a row says otherwise.</div>
                        }
                    </div>
                }
            </div>
        </section>
    `,
    styles: [
        `
            .fpms-standards input.form-control {
                min-width: 6rem;
            }
            /* No up/down spinners: values are typed, and the spinners crowd the narrow cells. */
            .fpms-standards input[type='number'] {
                -moz-appearance: textfield;
                appearance: textfield;
            }
            .fpms-standards input[type='number']::-webkit-outer-spin-button,
            .fpms-standards input[type='number']::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
        `,
    ],
})
export class FarmStandardsComponent extends FpmsPage implements OnInit {
    s = signal<any>(null);
    edit: Record<string, { min: number | null; max: number | null }> = {};
    bandEdit: Record<string, { min: number | null; max: number | null }> = {};
    thresholdEdit: Record<string, number | null> = {};
    /** The values as last loaded, so a row can tell whether it has unsaved changes. */
    private baseEdit: Record<string, { min: number | null; max: number | null }> = {};
    private baseBand: Record<string, { min: number | null; max: number | null }> = {};
    private baseThreshold: Record<string, number | null> = {};

    ngOnInit(): void {
        this.load();
    }

    bandKey(b: any): string {
        return `${b.farmingSystem}-${b.constructionType}`;
    }

    async load(): Promise<void> {
        const x = await this.api.get<any>('FarmStandards', 'Get');
        this.edit = Object.fromEntries(x.parameters.map((p: any) => [p.code, { min: p.differs ? p.farmMin : null, max: p.differs ? p.farmMax : null }]));
        this.bandEdit = Object.fromEntries(x.densityBands.map((b: any) => [this.bandKey(b), { min: b.differs ? b.farmMin : null, max: b.differs ? b.farmMax : null }]));
        this.thresholdEdit = Object.fromEntries(x.thresholds.map((t: any) => [t.code, t.differs ? t.farmValue : null]));
        this.baseEdit = structuredClone(this.edit);
        this.baseBand = structuredClone(this.bandEdit);
        this.baseThreshold = { ...this.thresholdEdit };
        this.s.set(x);
    }

    parameterDirty(p: any): boolean {
        return this.rangeChanged(this.edit[p.code], this.baseEdit[p.code]);
    }

    bandDirty(b: any): boolean {
        return this.rangeChanged(this.bandEdit[this.bandKey(b)], this.baseBand[this.bandKey(b)]);
    }

    thresholdDirty(t: any): boolean {
        return this.num(this.thresholdEdit[t.code]) !== this.num(this.baseThreshold[t.code]);
    }

    private rangeChanged(now?: { min: any; max: any }, was?: { min: any; max: any }): boolean {
        return this.num(now?.min) !== this.num(was?.min) || this.num(now?.max) !== this.num(was?.max);
    }

    /** The source most rows share; a row repeats its source only when it differs, so the same text is not printed on every row. */
    commonSource(rows: any[]): string | null {
        const counts = new Map<string, number>();
        for (const r of rows ?? []) {
            if (r.source) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
        }
        let best: string | null = null;
        let n = 1;
        for (const [src, c] of counts) {
            if (c > n) {
                best = src;
                n = c;
            }
        }
        return best;
    }

    private num(v: any): number | null {
        return v === '' || v == null ? null : Number(v);
    }

    private async save(method: string, body: any, message: string): Promise<void> {
        if (await this.act(() => this.api.post('FarmStandards', method, body))) {
            this.notifySaved(message);
            await this.load();
        }
    }


    saveParameter(p: any): Promise<void> {
        const e = this.edit[p.code];
        return this.save('SetParameterRange', { code: p.code, optimalMin: this.num(e.min), optimalMax: this.num(e.max) }, `${p.name} range saved. New readings use it.`);
    }

    resetParameter(p: any): Promise<void> {
        return this.save('ResetParameterRange', { code: p.code }, `${p.name} reset to the standard.`);
    }

    saveBand(b: any): Promise<void> {
        const e = this.bandEdit[this.bandKey(b)];
        return this.save('SetDensityBand', { farmingSystem: b.farmingSystem, constructionType: b.constructionType, minPlM2: this.num(e.min), maxPlM2: this.num(e.max) }, 'Density band saved.');
    }

    resetBand(b: any): Promise<void> {
        return this.save('ResetDensityBand', { farmingSystem: b.farmingSystem, constructionType: b.constructionType }, 'Density range reset to the standard.');
    }

    saveThreshold(t: any): Promise<void> {
        return this.save('SetThreshold', { code: t.code, value: this.num(this.thresholdEdit[t.code]) }, 'Threshold saved.');
    }

    resetThreshold(t: any): Promise<void> {
        return this.save('ResetThreshold', { code: t.code }, 'Threshold reset to the standard.');
    }

    markReviewed(): Promise<void> {
        return this.save('MarkReviewed', {}, 'Farm Standards marked as reviewed.');
    }
}
