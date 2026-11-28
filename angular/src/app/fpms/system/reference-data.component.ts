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
                <p class="text-muted">Readings outside the optimal range are saved and flagged. Readings outside the physical limits are rejected as entry errors. Changes apply to new readings only.</p>
                @if (edit) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="parameter-edit-title"><div class="fpms-dialog-body p-0">
                        <form class="card card-outline card-primary" #pf="ngForm" (ngSubmit)="save()" fpmsReview="parameter" [fpmsReviewNew]="false" novalidate>
                            <div class="card-header"><h3 id="parameter-edit-title" class="card-title">Edit {{ edit.code }}</h3></div>
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group col-md-4">
                                        <label for="n">Name</label>
                                        <input id="n" name="name" class="form-control" [(ngModel)]="edit.name" maxlength="100" />
                                    </div>
                                    <div class="form-group col-md-2">
                                        <label for="u">Unit</label>
                                        <input id="u" name="unitCode" class="form-control" [(ngModel)]="edit.unitCode" maxlength="30" />
                                    </div>
                                    <div class="form-group col-md-3">
                                        <label for="pmin">Physical min</label>
                                        <input id="pmin" name="physicalMin" type="number" step="any" class="form-control" [(ngModel)]="edit.physicalMin" />
                                    </div>
                                    <div class="form-group col-md-3">
                                        <label for="pmax">Physical max</label>
                                        <input id="pmax" name="physicalMax" type="number" step="any" class="form-control" [(ngModel)]="edit.physicalMax" />
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group col-md-3">
                                        <label for="omin">Optimal min</label>
                                        <input id="omin" name="optimalMin" type="number" step="any" class="form-control" [(ngModel)]="edit.optimalMin" />
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="omine" name="optimalMinExclusive" [(ngModel)]="edit.optimalMinExclusive" />
                                            <label class="custom-control-label" for="omine">Exclusive (&gt;)</label>
                                        </div>
                                    </div>
                                    <div class="form-group col-md-3">
                                        <label for="omax">Optimal max</label>
                                        <input id="omax" name="optimalMax" type="number" step="any" class="form-control" [(ngModel)]="edit.optimalMax" />
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="omaxe" name="optimalMaxExclusive" [(ngModel)]="edit.optimalMaxExclusive" />
                                            <label class="custom-control-label" for="omaxe">Exclusive (&lt;)</label>
                                        </div>
                                    </div>
                                    <div class="form-group col-md-4">
                                        <label for="g">Monitoring frequency (guidance)</label>
                                        <input id="g" name="guidanceFrequency" class="form-control" [(ngModel)]="edit.guidanceFrequency" maxlength="100" />
                                    </div>
                                    <div class="form-group col-md-2 fpms-check-cell">
                                        <div class="custom-control custom-checkbox">
                                            <input type="checkbox" class="custom-control-input" id="act" name="isActive" [(ngModel)]="edit.isActive" />
                                            <label class="custom-control-label" for="act">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group col-md-6">
                                        <label for="rlow">Recommendation when below the range</label>
                                        <textarea id="rlow" name="lowRecommendation" rows="3" class="form-control" [(ngModel)]="edit.lowRecommendation" maxlength="500"></textarea>
                                    </div>
                                    <div class="form-group col-md-6">
                                        <label for="rhigh">Recommendation when above the range</label>
                                        <textarea id="rhigh" name="highRecommendation" rows="3" class="form-control" [(ngModel)]="edit.highRecommendation" maxlength="500"></textarea>
                                    </div>
                                </div>
                                <p class="text-muted mb-0">Leave an optimal bound empty for no limit on that side. Recommendations are shown to farm staff with the out-of-range warning.</p>
                            </div>
                            <div class="card-footer">
                                <button type="submit" class="btn btn-primary mr-2" [disabled]="busy()">Save</button>
                                <button type="button" class="btn btn-default" (click)="edit = null">Cancel</button>
                            </div>
                        </form>
                    </div></div></div>
                }
                <div class="card">
                    <div class="card-body p-0 table-responsive">
                        @if (!list()) {
                            <fpms-loading></fpms-loading>
                        } @else {
                            <!-- Five columns (DEC-122): the parameter with its code and unit; limits; how often, and whether stocking needs it. -->
                            <table class="table table-hover mb-0">
                                <thead><tr><th>Parameter</th><th>Optimal range</th><th title="Readings outside these are rejected as entry errors">Physical limits</th><th title="Monitoring frequency (guidance)">Frequency</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (p of list(); track p.code) {
                                        <tr [class.text-muted]="!p.isActive">
                                            <td>
                                                <span class="fpms-pond-tag mr-1">{{ p.code }}</span><strong>{{ p.name }}</strong>
                                                @if (p.unitCode) { <div class="text-muted">in {{ p.unitCode }}</div> }
                                            </td>
                                            <td>{{ p.optimalRange || 'No range: recorded only' }}</td>
                                            <td class="text-nowrap">{{ p.physicalMin }} – {{ p.physicalMax }}</td>
                                            <td>
                                                {{ p.guidanceFrequency || '—' }}
                                                @if (p.requiredAtStocking) { <div class="text-muted">Required at stocking</div> }
                                            </td>
                                            <td><fpms-badge [text]="p.isActive ? 'Active' : 'Inactive'" [tone]="p.isActive ? 'success' : 'secondary'"></fpms-badge></td>
                                            <td class="text-right"><button class="btn btn-sm btn-outline-primary" (click)="startEdit(p)" [attr.aria-label]="'Edit ' + p.name">Edit</button></td>
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
