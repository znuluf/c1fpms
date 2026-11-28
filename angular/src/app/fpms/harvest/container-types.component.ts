import { Component, OnInit, signal, inject } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { SectionNav } from '@shared/layout/section-nav.service';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';

/**
 * The farm's crate types (DEC-80). "Crate" is the standard word; a type names it (banyera, tub, box) for the crate tally's
 * quick add. The usual kg prefills the quick add; an empty weight (tare) means the crate is on the scale and is subtracted.
 * One can be the default. The code keeps the name ContainerType.
 */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Crate types" subtitle="Name the crates you weigh with (banyera, tub, box). A crate with no type is just called a crate."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <div class="fpms-grid-row">
                    <div class="fpms-col-xl-8">
                        <div class="fpms-panel">
                            <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                                @if (!types()) {
                                    <fpms-loading></fpms-loading>
                                } @else if (!types()?.length) {
                                    <fpms-empty text="No crate types yet. Crates are recorded as &quot;Crate&quot;. Add a type (e.g. &quot;Banyera 30 kg&quot;) so the crate tally can fill in its name and weight." icon="fas fa-box"></fpms-empty>
                                } @else {
                                    <table class="fpms-data-table fpms-no-bottom">
                                        <thead>
                                            <tr><th>Name</th><th class="fpms-align-end">Usual kg</th><th class="fpms-align-end" title="Empty weight of the crate (tare)">Empty kg</th><th class="fpms-align-end">Order</th><th>Use</th><th><span class="fpms-visually-hidden">Actions</span></th></tr>
                                        </thead>
                                        <tbody>
                                            @for (t of types(); track t.id) {
                                                <tr [class.fpms-muted]="!t.isActive">
                                                    @if (canManage) {
                                                        <td><input class="fpms-control fpms-control-compact" [(ngModel)]="t.name" maxlength="40" [attr.aria-label]="'Name ' + t.name" /></td>
                                                        <td><input type="number" min="0.001" step="0.001" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="t.nominalKg" aria-label="Usual kg" /></td>
                                                        <td><input type="number" min="0.001" step="0.001" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="t.tareKg" aria-label="Empty weight (kg)" placeholder="none" /></td>
                                                        <td style="width: 6rem"><input type="number" min="0" max="999" class="fpms-control fpms-control-compact fpms-align-end" [(ngModel)]="t.sortOrder" aria-label="Order" /></td>
                                                        <td class="fpms-nowrap">
                                                            <div class="fpms-check fpms-check-box">
                                                                <input type="checkbox" class="fpms-check-input" [id]="'cd' + t.id" [(ngModel)]="t.isDefault" />
                                                                <label class="fpms-check-label fpms-weight-normal" [for]="'cd' + t.id">Default</label>
                                                            </div>
                                                            <div class="fpms-check fpms-check-box">
                                                                <input type="checkbox" class="fpms-check-input" [id]="'ca' + t.id" [(ngModel)]="t.isActive" />
                                                                <label class="fpms-check-label fpms-weight-normal" [for]="'ca' + t.id">Active</label>
                                                            </div>
                                                        </td>
                                                        <td class="fpms-align-end"><button class="fpms-button fpms-button-compact fpms-button-outline" [disabled]="busy() || !t.name?.trim()" (click)="save(t)">Save</button></td>
                                                    } @else {
                                                        <td>{{ t.name }}</td>
                                                        <td class="fpms-align-end">{{ t.nominalKg != null ? (t.nominalKg | num: 3) : '—' }}</td>
                                                        <td class="fpms-align-end">{{ t.tareKg != null ? (t.tareKg | num: 3) : '—' }}</td>
                                                        <td class="fpms-align-end">{{ t.sortOrder }}</td>
                                                        <td>{{ t.isDefault ? 'Default · ' : '' }}{{ t.isActive ? 'Active' : 'Inactive' }}</td>
                                                        <td></td>
                                                    }
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                }
                            </div>
                        </div>
                        <p class="fpms-small fpms-space-bottom-1"><strong>Naming:</strong> kind, usual capacity, then the owner when the crates are not the farm's, e.g. "Banyera 30 kg", "Tub 10 kg", "Tub 25 kg – Mindanao Processing". A buyer's crates get their own type, with their own empty weight.</p>
                        <p class="fpms-small fpms-muted fpms-space-bottom-1">The default crate type is picked first in the crate tally, and its usual kg fills in the weight.</p>
                        <p class="fpms-small fpms-muted fpms-space-bottom-1">Leave the empty weight blank when the shrimp are weighed without the crate. When it is set, weights for that crate type are read with the crate on the scale, and the empty weight is subtracted.</p>
                        <p class="fpms-small fpms-muted">Deactivate a crate type you no longer use; harvests already saved keep its name and empty weight.</p>
                    </div>
                    @if (canManage) {
                        <div class="fpms-col-xl-4">
                            <div class="fpms-panel">
                                <div class="fpms-panel-head"><h3 class="fpms-panel-title">Add a crate type</h3></div>
                                <form class="fpms-panel-body" #f="ngForm" (ngSubmit)="save(draft, true)" fpmsReview="crate type" [fpmsReviewNew]="true" novalidate>
                                    <div class="fpms-field">
                                        <label for="cn">Name <span class="fpms-danger">*</span></label>
                                        <input id="cn" class="fpms-control" name="name" [(ngModel)]="draft.name" required maxlength="40" placeholder="e.g. Banyera 30 kg" />
                                        <small class="fpms-help fpms-muted">Kind, capacity, then the owner if not the farm's.</small>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-6">
                                            <label for="cu">Usual kg</label>
                                            <input id="cu" type="number" min="0.001" step="0.001" class="fpms-control" name="nominalKg" [(ngModel)]="draft.nominalKg" placeholder="e.g. 30" />
                                        </div>
                                        <div class="fpms-field fpms-col-6">
                                            <label for="ct">Empty weight (kg)</label>
                                            <input id="ct" type="number" min="0.001" step="0.001" class="fpms-control" name="tareKg" [(ngModel)]="draft.tareKg" placeholder="none" />
                                        </div>
                                    </div>
                                    <div class="fpms-check fpms-check-box fpms-space-bottom-3">
                                        <input type="checkbox" class="fpms-check-input" id="cd" name="isDefault" [(ngModel)]="draft.isDefault" />
                                        <label class="fpms-check-label" for="cd">Use as the default</label>
                                    </div>
                                    <button type="submit" class="fpms-button fpms-button-primary" [disabled]="busy() || !f.form.valid">Add crate type</button>
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
export class ContainerTypesComponent extends FpmsPage implements OnInit {
    /** Keeps this list's count on the Setup tab bar in step with the list (DEC-85 step 7). */
    private sectionNav = inject(SectionNav);
    types = signal<any[] | null>(null);
    draft: any = this.blank();

    get canManage(): boolean {
        return this.can('Farm.Harvests.EditAny');
    }

    blank(): any {
        return { id: EMPTY_GUID, name: '', nominalKg: null, tareKg: null, sortOrder: 0, isDefault: false, isActive: true };
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.types.set(await this.api.get<any[]>('ContainerType', 'GetAll'));
        this.sectionNav.setCount('/app/harvests/crate-types', (this.types() ?? []).length);
    }

    async save(t: any, isNew = false): Promise<void> {
        const body = { ...t, nominalKg: t.nominalKg || null, tareKg: t.tareKg || null };
        if (await this.act(() => this.api.post('ContainerType', 'Save', body))) {
            this.notifySaved(isNew ? 'Crate type added.' : 'Crate type saved.');
            if (isNew) {
                this.draft = this.blank();
            }
            await this.load();
        }
    }
}
