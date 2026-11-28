import { Component, OnInit, signal, inject } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { SectionNav } from '@shared/layout/section-nav.service';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';

/**
 * Price tables by count (DEC-82): a price per kg for each count range (pieces per kg), for one buyer or any. A sale line
 * priced "From a price table" reads the row covering the shrimp's count; it keeps a copy, so editing a table changes no sale.
 */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Price tables" subtitle="Prices per kg by count (pieces per kg), e.g. a buyer's weekly price list.">
            @if (canManage && !editing) {
                <button class="fpms-button fpms-button-primary" (click)="edit(null)"><i class="fas fa-plus fpms-icon-gap"></i>New price table</button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (editing) {
                    <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">{{ editing.id === emptyId ? 'New price table' : 'Edit ' + editing.name }}</h3></div>
                        <form class="fpms-panel-body" #f="ngForm" (ngSubmit)="save()" fpmsReview="price table" novalidate>
                            <div class="fpms-grid-row">
                                <div class="fpms-field fpms-col-md-5">
                                    <label for="tn">Name <span class="fpms-danger">*</span></label>
                                    <input id="tn" class="fpms-control" name="name" [(ngModel)]="editing.name" required maxlength="60" placeholder="e.g. Mindanao Processing, November" />
                                </div>
                                <div class="fpms-field fpms-col-md-5">
                                    <label for="tb">For buyer</label>
                                    <select id="tb" class="fpms-control" name="buyerId" [(ngModel)]="editing.buyerId">
                                        <option value="">Any buyer</option>
                                        @for (b of buyers; track b.id) { <option [value]="b.id">{{ b.name }}</option> }
                                    </select>
                                    <small class="fpms-help fpms-muted">A buyer's own table is suggested on their next sale.</small>
                                </div>
                                <div class="fpms-field fpms-col-md-2 fpms-check-cell">
                                    <div class="fpms-check fpms-check-box">
                                        <input type="checkbox" class="fpms-check-input" id="ta" name="isActive" [(ngModel)]="editing.isActive" />
                                        <label class="fpms-check-label" for="ta">Active</label>
                                    </div>
                                </div>
                            </div>
                            <div class="fpms-table-scroll">
                                <table class="fpms-data-table fpms-table-compact fpms-space-bottom-2">
                                    <thead><tr><th>From count (pcs/kg)</th><th>To count (pcs/kg)</th><th>Price per kg (₱) <span class="fpms-danger">*</span></th><th></th></tr></thead>
                                    <tbody>
                                        @for (r of editing.rows; track $index) {
                                            <tr>
                                                <td><input type="number" min="1" step="1" class="fpms-control fpms-control-compact" [name]="'rmin' + $index" [(ngModel)]="r.minCountPerKg" placeholder="no lower limit" aria-label="From count" /></td>
                                                <td><input type="number" min="1" step="1" class="fpms-control fpms-control-compact" [name]="'rmax' + $index" [(ngModel)]="r.maxCountPerKg" placeholder="no upper limit" aria-label="To count" /></td>
                                                <td><input type="number" min="0" step="0.01" class="fpms-control fpms-control-compact" [name]="'rp' + $index" [(ngModel)]="r.pricePerKg" required aria-label="Price per kg" /></td>
                                                <td class="fpms-align-end">
                                                    <button type="button" class="fpms-button fpms-button-compact fpms-button-danger" (click)="editing.rows.splice($index, 1)" aria-label="Remove row"><i class="fas fa-times"></i></button>
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary fpms-space-bottom-3" (click)="addRow()"><i class="fas fa-plus fpms-icon-gap"></i>Add count range</button>
                            <p class="fpms-small fpms-muted">A smaller count means bigger shrimp. Ranges may not overlap; leave an end empty for "up to" or "and above".</p>
                            <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !f.form.valid || !editing.rows.length">Save table</button>
                            <button type="button" class="fpms-button fpms-button-secondary" (click)="editing = null">Cancel</button>
                        </form>
                    </div>
                }
                @if (!tables()) {
                    <fpms-loading></fpms-loading>
                } @else if (!tables()?.length) {
                    <div class="fpms-panel"><div class="fpms-panel-body"><fpms-empty text="No price tables yet. Add one when a buyer prices by count, e.g. 41–50 pcs/kg at ₱400." icon="fas fa-table"></fpms-empty></div></div>
                } @else {
                    <div class="fpms-grid-row">
                        @for (t of tables(); track t.id) {
                            <div class="fpms-col-lg-6">
                                <div class="fpms-panel" [class.fpms-muted]="!t.isActive">
                                    <div class="fpms-panel-head fpms-flex fpms-align-center-items">
                                        <h3 class="fpms-panel-title fpms-margin-auto-end">{{ t.name }}{{ t.isActive ? '' : ' (inactive)' }}</h3>
                                        <span class="fpms-small fpms-icon-gap">{{ t.buyerName || 'Any buyer' }}</span>
                                        @if (canManage) { <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="edit(t)">Edit</button> }
                                    </div>
                                    <div class="fpms-panel-body fpms-space-0">
                                        <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                            <thead><tr><th>Count</th><th class="fpms-align-end">Price per kg</th></tr></thead>
                                            <tbody>
                                                @for (r of t.rows; track $index) {
                                                    <tr><td>{{ r.label }}</td><td class="fpms-align-end">{{ r.pricePerKg | php }}</td></tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        }
                    </div>
                }
            </div>
        </section>
    `,
})
export class PriceTablesComponent extends FpmsPage implements OnInit {
    /** Keeps this list's count on the Setup tab bar in step with the list (DEC-85 step 7). */
    private sectionNav = inject(SectionNav);
    readonly emptyId = EMPTY_GUID;
    tables = signal<any[] | null>(null);
    buyers: any[] = [];
    editing: any = null;

    get canManage(): boolean {
        return this.can('Farm.Production.Manage');
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        const [tables, buyers] = await Promise.all([this.api.get<any[]>('PriceTable', 'GetAll'), this.api.get<any[]>('TallySheet', 'GetBuyerOptions')]);
        this.buyers = buyers.filter((b) => b.isActive);
        this.tables.set(tables);
        this.sectionNav.setCount('/app/sales/price-tables', (this.tables() ?? []).length);
    }

    edit(t: any): void {
        this.editing = t
            ? { ...t, buyerId: t.buyerId ?? '', rows: t.rows.map((r: any) => ({ ...r })) }
            : { id: EMPTY_GUID, name: '', buyerId: '', isActive: true, rows: [{ minCountPerKg: null, maxCountPerKg: null, pricePerKg: null }] };
    }

    /** The next range starts after the last one ends. */
    addRow(): void {
        const last = this.editing.rows[this.editing.rows.length - 1];
        const from = last?.maxCountPerKg ? Number(last.maxCountPerKg) + 1 : null;
        this.editing.rows.push({ minCountPerKg: from, maxCountPerKg: null, pricePerKg: null });
    }

    async save(): Promise<void> {
        const n = (v: any) => (v === '' || v == null ? null : Number(v));
        const body = {
            id: this.editing.id, name: this.editing.name, buyerId: this.editing.buyerId || null, isActive: this.editing.isActive,
            rows: this.editing.rows.map((r: any) => ({ minCountPerKg: n(r.minCountPerKg), maxCountPerKg: n(r.maxCountPerKg), pricePerKg: Number(r.pricePerKg) || 0 })),
        };
        if (await this.act(() => this.api.post('PriceTable', 'Save', body))) {
            this.notifySaved('Price table saved.');
            this.editing = null;
            await this.load();
        }
    }
}
