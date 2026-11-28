import { Component, OnInit, signal, inject } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { SectionNav } from '@shared/layout/section-nav.service';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';

/** The farm's size grade list (spec Section 5): pieces per kg, used on harvest and sale lines. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Size grades" subtitle="Count grades (pieces per kg) used on harvests and sales."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <div class="fpms-grid-row">
                    <div class="fpms-col-xl-8">
                        <div class="fpms-panel">
                            <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                                @if (!grades()) {
                                    <fpms-loading></fpms-loading>
                                } @else {
                                    <table class="fpms-data-table fpms-no-bottom">
                                        <thead>
                                            <tr><th>Label</th><th class="fpms-align-end">Min pcs/kg</th><th class="fpms-align-end">Max pcs/kg</th><th class="fpms-align-end">Order</th><th>Active</th><th></th></tr>
                                        </thead>
                                        <tbody>
                                            @for (g of grades(); track g.id) {
                                                <tr [class.fpms-muted]="!g.isActive">
                                                    @if (canManage) {
                                                        <td><input class="fpms-control fpms-control-compact" [(ngModel)]="g.label" maxlength="20" [attr.aria-label]="'Label ' + g.label" /></td>
                                                        <td><input type="number" min="1" max="1000" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="g.minCountPerKg" aria-label="Minimum pieces per kg" /></td>
                                                        <td><input type="number" min="1" max="1000" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="g.maxCountPerKg" aria-label="Maximum pieces per kg" /></td>
                                                        <td style="width: 6rem"><input type="number" min="0" max="999" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="g.sortOrder" aria-label="Order" /></td>
                                                        <td><input type="checkbox" [(ngModel)]="g.isActive" [attr.aria-label]="'Active: ' + g.label" /></td>
                                                        <td class="fpms-align-end"><button class="fpms-button fpms-button-compact fpms-button-outline" [disabled]="busy() || !g.label?.trim()" (click)="save(g)">Save</button></td>
                                                    } @else {
                                                        <td>{{ g.label }}</td>
                                                        <td class="fpms-align-end">{{ g.minCountPerKg ?? '—' }}</td>
                                                        <td class="fpms-align-end">{{ g.maxCountPerKg ?? '—' }}</td>
                                                        <td class="fpms-align-end">{{ g.sortOrder }}</td>
                                                        <td>{{ g.isActive ? 'Yes' : 'No' }}</td>
                                                        <td></td>
                                                    }
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                }
                            </div>
                        </div>
                        <p class="fpms-small fpms-muted">Deactivate a grade you no longer use; harvests that already use it keep it.</p>
                    </div>
                    @if (canManage) {
                        <div class="fpms-col-xl-4">
                            <div class="fpms-panel">
                                <div class="fpms-panel-head"><h3 class="fpms-panel-title">Add a size grade</h3></div>
                                <form class="fpms-panel-body" #f="ngForm" (ngSubmit)="save(draft, true)" fpmsReview="size grade" [fpmsReviewNew]="true" novalidate>
                                    <div class="fpms-field">
                                        <label for="gl">Label <span class="fpms-danger">*</span></label>
                                        <input id="gl" class="fpms-control" name="label" [(ngModel)]="draft.label" required maxlength="20" placeholder="e.g. 20/30" />
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-6">
                                            <label for="gmin">Min pcs/kg</label>
                                            <input id="gmin" type="number" min="1" max="1000" class="fpms-control" name="min" [(ngModel)]="draft.minCountPerKg" />
                                        </div>
                                        <div class="fpms-field fpms-col-6">
                                            <label for="gmax">Max pcs/kg</label>
                                            <input id="gmax" type="number" min="1" max="1000" class="fpms-control" name="max" [(ngModel)]="draft.maxCountPerKg" />
                                        </div>
                                    </div>
                                    <button type="submit" class="fpms-button fpms-button-primary" [disabled]="busy() || !f.form.valid">Add grade</button>
                                    <fpms-form-hint [form]="f"></fpms-form-hint>
                                </form>
                            </div>
                        </div>
                    }
                </div>
            </div>
        </section>
    `,
})
export class SizeGradesComponent extends FpmsPage implements OnInit {
    /** Keeps this list's count on the Setup tab bar in step with the list (DEC-85 step 7). */
    private sectionNav = inject(SectionNav);
    grades = signal<any[] | null>(null);
    draft: any = this.blank();

    get canManage(): boolean {
        return this.can('Farm.Harvests.EditAny');
    }

    blank(): any {
        return { id: EMPTY_GUID, label: '', minCountPerKg: null, maxCountPerKg: null, sortOrder: 0, isActive: true };
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.grades.set(await this.api.get<any[]>('SizeGrade', 'GetAll'));
        this.sectionNav.setCount('/app/harvests/size-grades', (this.grades() ?? []).length);
    }

    async save(g: any, isNew = false): Promise<void> {
        const body = { ...g, minCountPerKg: g.minCountPerKg || null, maxCountPerKg: g.maxCountPerKg || null };
        if (await this.act(() => this.api.post('SizeGrade', 'Save', body))) {
            this.notifySaved(isNew ? 'Size grade added.' : 'Size grade saved.');
            if (isNew) {
                this.draft = this.blank();
            }
            await this.load();
        }
    }
}
