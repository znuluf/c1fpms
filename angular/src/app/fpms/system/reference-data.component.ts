import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';

/** Water-quality reference data: GAqP optimal ranges and physical limits (D-09). System Administrator only. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Reference data" subtitle="Water-quality parameters and their national-standard defaults (GAqP, PNS/BAFS 197:2017). System Administration."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <p class="fpms-muted">Readings outside the optimal range are saved and flagged. Readings outside the physical limits are rejected as entry errors. Changes apply to new readings only.</p>
                @if (edit) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="parameter-edit-title"><div class="fpms-dialog-body fpms-space-0">
                        <form class="fpms-panel fpms-panel-outline fpms-panel-primary" #pf="ngForm" (ngSubmit)="save()" fpmsReview="parameter" [fpmsReviewNew]="false" novalidate>
                            <div class="fpms-panel-head"><h3 id="parameter-edit-title" class="fpms-panel-title">Edit {{ edit.code }}</h3></div>
                            <div class="fpms-panel-body">
                                <div class="fpms-grid-row">
                                    <div class="fpms-field fpms-col-md-4">
                                        <label for="n">Name</label>
                                        <input id="n" name="name" class="fpms-control" [(ngModel)]="edit.name" maxlength="100" />
                                    </div>
                                    <div class="fpms-field fpms-col-md-2">
                                        <label for="u">Unit</label>
                                        <input id="u" name="unitCode" class="fpms-control" [(ngModel)]="edit.unitCode" maxlength="30" />
                                    </div>
                                    <div class="fpms-field fpms-col-md-3">
                                        <label for="pmin">Physical min</label>
                                        <input id="pmin" name="physicalMin" type="number" step="any" class="fpms-control" [(ngModel)]="edit.physicalMin" />
                                    </div>
                                    <div class="fpms-field fpms-col-md-3">
                                        <label for="pmax">Physical max</label>
                                        <input id="pmax" name="physicalMax" type="number" step="any" class="fpms-control" [(ngModel)]="edit.physicalMax" />
                                    </div>
                                </div>
                                <div class="fpms-grid-row">
                                    <div class="fpms-field fpms-col-md-3">
                                        <label for="omin">Optimal min</label>
                                        <input id="omin" name="optimalMin" type="number" step="any" class="fpms-control" [(ngModel)]="edit.optimalMin" />
                                        <div class="fpms-check fpms-check-box">
                                            <input type="checkbox" class="fpms-check-input" id="omine" name="optimalMinExclusive" [(ngModel)]="edit.optimalMinExclusive" />
                                            <label class="fpms-check-label" for="omine">Exclusive (&gt;)</label>
                                        </div>
                                    </div>
                                    <div class="fpms-field fpms-col-md-3">
                                        <label for="omax">Optimal max</label>
                                        <input id="omax" name="optimalMax" type="number" step="any" class="fpms-control" [(ngModel)]="edit.optimalMax" />
                                        <div class="fpms-check fpms-check-box">
                                            <input type="checkbox" class="fpms-check-input" id="omaxe" name="optimalMaxExclusive" [(ngModel)]="edit.optimalMaxExclusive" />
                                            <label class="fpms-check-label" for="omaxe">Exclusive (&lt;)</label>
                                        </div>
                                    </div>
                                    <div class="fpms-field fpms-col-md-4">
                                        <label for="g">Monitoring frequency (guidance)</label>
                                        <input id="g" name="guidanceFrequency" class="fpms-control" [(ngModel)]="edit.guidanceFrequency" maxlength="100" />
                                    </div>
                                    <div class="fpms-field fpms-col-md-2 fpms-check-cell">
                                        <div class="fpms-check fpms-check-box">
                                            <input type="checkbox" class="fpms-check-input" id="act" name="isActive" [(ngModel)]="edit.isActive" />
                                            <label class="fpms-check-label" for="act">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="fpms-grid-row">
                                    <div class="fpms-field fpms-col-md-6">
                                        <label for="rlow">Recommendation when below the range</label>
                                        <textarea id="rlow" name="lowRecommendation" rows="3" class="fpms-control" [(ngModel)]="edit.lowRecommendation" maxlength="500"></textarea>
                                    </div>
                                    <div class="fpms-field fpms-col-md-6">
                                        <label for="rhigh">Recommendation when above the range</label>
                                        <textarea id="rhigh" name="highRecommendation" rows="3" class="fpms-control" [(ngModel)]="edit.highRecommendation" maxlength="500"></textarea>
                                    </div>
                                </div>
                                <p class="fpms-muted fpms-no-bottom">Leave an optimal bound empty for no limit on that side. Recommendations are shown to farm staff with the out-of-range warning.</p>
                            </div>
                            <div class="fpms-panel-foot">
                                <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy()">Save</button>
                                <button type="button" class="fpms-button fpms-button-secondary" (click)="edit = null">Cancel</button>
                            </div>
                        </form>
                    </div></div></div>
                }
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!list()) {
                            <fpms-loading></fpms-loading>
                        } @else {
                            <!-- Five columns (DEC-122): the parameter with its code and unit; limits; how often, and whether stocking needs it. -->
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead><tr><th>Parameter</th><th>Optimal range</th><th title="Readings outside these are rejected as entry errors">Physical limits</th><th title="Monitoring frequency (guidance)">Frequency</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (p of list(); track p.code) {
                                        <tr [class.fpms-muted]="!p.isActive">
                                            <td>
                                                <span class="fpms-pond-tag fpms-icon-gap">{{ p.code }}</span><strong>{{ p.name }}</strong>
                                                @if (p.unitCode) { <div class="fpms-muted">in {{ p.unitCode }}</div> }
                                            </td>
                                            <td>{{ p.optimalRange || 'No range: recorded only' }}</td>
                                            <td class="fpms-nowrap">{{ p.physicalMin }} – {{ p.physicalMax }}</td>
                                            <td>
                                                {{ p.guidanceFrequency || '—' }}
                                                @if (p.requiredAtStocking) { <div class="fpms-muted">Required at stocking</div> }
                                            </td>
                                            <td><fpms-badge [text]="p.isActive ? 'Active' : 'Inactive'" [tone]="p.isActive ? 'success' : 'secondary'"></fpms-badge></td>
                                            <td class="fpms-align-end"><button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startEdit(p)" [attr.aria-label]="'Edit ' + p.name">Edit</button></td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                </div>
            </div>
        </section>
    `,
})
export class ReferenceDataComponent extends FpmsPage implements OnInit {
    list = signal<any[] | null>(null);
    edit: any = null;

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.list.set(await this.api.get<any[]>('SystemReferenceData', 'GetParameters'));
    }

    startEdit(p: any): void {
        this.edit = { ...p };
    }

    async save(): Promise<void> {
        const e = this.edit;
        const body = {
            ...e,
            optimalMin: e.optimalMin === '' || e.optimalMin === undefined ? null : e.optimalMin,
            optimalMax: e.optimalMax === '' || e.optimalMax === undefined ? null : e.optimalMax,
        };
        if (await this.act(() => this.api.put('SystemReferenceData', 'UpdateParameter', body))) {
            this.notifySaved('Parameter saved.');
            this.edit = null;
            this.load();
        }
    }
}
