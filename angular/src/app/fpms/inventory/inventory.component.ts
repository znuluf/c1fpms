import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { InventoryUnits } from '@shared/fpms/labels';
import { FPMS_IMPORTS } from '../shared-imports';
import { ClientListFilter } from '@shared/fpms/client-list';

/** Feed and additive/supplement inventory ledger (Refs 3.2, 3.3; D-14, D-19). */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Inventory" subtitle="Feed, supplements and chemicals: stock on hand per lot.">
            @if (canManage) {
                <button class="fpms-button fpms-button-primary fpms-icon-gap" (click)="startReceipt()"><i class="fas fa-truck-loading fpms-icon-gap"></i>Record receipt</button>
                <button class="fpms-button fpms-button-outline" (click)="startItem()"><i class="fas fa-plus fpms-icon-gap"></i>New item</button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (itemForm) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-item-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head"><h3 id="inventory-item-dialog-title" class="fpms-panel-title">{{ itemForm.id === empty ? 'New inventory item' : 'Edit ' + itemForm.displayName }}</h3></div>
                            <form #itf="ngForm" (ngSubmit)="saveItem()" fpmsReview="item" [fpmsReviewNew]="itemForm.id === empty" novalidate>
                                <div class="fpms-panel-body">
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="cat">Category <span class="fpms-danger">*</span></label>
                                            <select id="cat" class="fpms-control" name="category" [(ngModel)]="itemForm.category">
                                                @for (o of Options.inventoryCategory; track o.value) {
                                                    <option [ngValue]="o.value">{{ o.label }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="un">Unit <span class="fpms-danger">*</span></label>
                                            <select id="un" class="fpms-control" name="unit" [(ngModel)]="itemForm.unit">
                                                @for (u of units; track u) {
                                                    <option [value]="u">{{ u }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="cd">Code</label>
                                            <input id="cd" class="fpms-control fpms-uppercase" name="code" [(ngModel)]="itemForm.code" maxlength="20" placeholder="e.g. N314" aria-describedby="cd-h" />
                                            <small id="cd-h" class="fpms-help fpms-muted">What the farm calls it; shown first.</small>
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-12">
                                            <label for="pn">Product name <span class="fpms-danger">*</span></label>
                                            <input id="pn" class="fpms-control" name="productName" [(ngModel)]="itemForm.productName" required maxlength="150" />
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="ps">Pack size ({{ itemForm.unit }} per pack)</label>
                                            <input id="ps" type="number" min="0.001" step="0.001" class="fpms-control" name="packSize" [(ngModel)]="itemForm.packSize" placeholder="e.g. 25 per bag" />
                                            <small class="fpms-help fpms-muted">Lets receipts be entered in packs.</small>
                                        </div>
                                        @if (itemForm.category !== 1) {
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="wdd">Withdrawal period (days)</label>
                                                <input id="wdd" type="number" min="0" max="365" step="1" class="fpms-control" name="defaultWithdrawalDays" [(ngModel)]="itemForm.defaultWithdrawalDays" />
                                                <small class="fpms-help fpms-muted">Pre-filled when the product is applied.</small>
                                            </div>
                                        }
                                        <div class="fpms-field fpms-col-md-4 fpms-check-cell">
                                            <div class="fpms-check fpms-check-box">
                                                <input type="checkbox" class="fpms-check-input" id="iact" name="isActive" [(ngModel)]="itemForm.isActive" />
                                                <label class="fpms-check-label" for="iact">Active</label>
                                            </div>
                                        </div>
                                    </div>
                                    <details #moreItem class="fpms-fold" [open]="moreItem.open || hasItemExtras()">
                                        <summary>More details <span class="fpms-fold-hint">brand, feed type or active ingredient, BAI no., reorder level</span></summary>
                                        <div class="fpms-grid-row">
                                        @if (itemForm.category === 1) {
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="ft">Feed type</label>
                                                <input id="ft" class="fpms-control" name="feedType" [(ngModel)]="itemForm.feedType" maxlength="50" list="feedTypes" placeholder="starter, grower, finisher" />
                                                <datalist id="feedTypes"><option value="Starter"></option><option value="Grower"></option><option value="Finisher"></option></datalist>
                                            </div>
                                        }
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="br">Brand</label>
                                                <input id="br" class="fpms-control" name="brand" [(ngModel)]="itemForm.brand" maxlength="100" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="bai">BAI registration no.</label>
                                                <input id="bai" class="fpms-control" name="baiRegistrationNo" [(ngModel)]="itemForm.baiRegistrationNo" maxlength="100" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="rl">Reorder level ({{ itemForm.unit }})</label>
                                                <input id="rl" type="number" min="0" step="0.001" class="fpms-control" name="reorderLevel" [(ngModel)]="itemForm.reorderLevel" />
                                                <small class="fpms-help fpms-muted">Stock at or below this shows as Low.</small>
                                            </div>
                                        @if (itemForm.category !== 1) {
                                            <div class="fpms-field fpms-col-md-6">
                                                <label for="ai">Active ingredient</label>
                                                <input id="ai" class="fpms-control" name="activeIngredient" [(ngModel)]="itemForm.activeIngredient" maxlength="150" placeholder="for drugs and chemicals" />
                                            </div>
                                        }
                                        </div>
                                    </details>
                                </div>
                                <div class="fpms-panel-foot">
                                    <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !itf.form.valid">Save item</button>
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="itemForm = null">Cancel</button>
                                    <fpms-form-hint [form]="itf"></fpms-form-hint>
                                </div>
                            </form>
                        </div>
                    </div></div></div>
                }

                @if (receipt) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="stock-receipt-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head"><h3 id="stock-receipt-dialog-title" class="fpms-panel-title">Record stock receipt</h3></div>
                            <form #rf="ngForm" (ngSubmit)="saveReceipt()" fpmsReview="receipt" [fpmsReviewNew]="true" novalidate>
                                <div class="fpms-panel-body">
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="ri">Item <span class="fpms-danger">*</span></label>
                                            <select id="ri" class="fpms-control" name="itemId" [(ngModel)]="receipt.itemId" required>
                                                @for (i of activeItems(); track i.id) {
                                                    <option [value]="i.id">{{ i.displayName }} ({{ i.unit }})</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="rl2">Lot number <span class="fpms-danger">*</span></label>
                                            <input id="rl2" class="fpms-control" name="lotNumber" [(ngModel)]="receipt.lotNumber" required maxlength="100" />
                                            <small class="fpms-help fpms-muted">An existing lot number adds to that lot.</small>
                                        </div>
                                        <div class="fpms-field fpms-col-md-2">
                                            <label for="rd">Received <span class="fpms-danger">*</span></label>
                                            <input id="rd" type="date" class="fpms-control" name="receivedDate" [(ngModel)]="receipt.receivedDate" required [max]="today" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="re">Lot expiry</label>
                                            <input id="re" type="date" class="fpms-control" name="expiryDate" [(ngModel)]="receipt.expiryDate" />
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        @if (receiptPackSize && receipt.inPacks) {
                                            <div class="fpms-field fpms-col-md-3">
                                                <label for="rpc">Packs <span class="fpms-danger">*</span></label>
                                                <input id="rpc" type="number" min="1" step="1" class="fpms-control" name="packCount" [(ngModel)]="receipt.packCount" required />
                                                <small class="fpms-help fpms-muted">= {{ (receipt.packCount || 0) * receiptPackSize | num: 3 }} {{ unitOf(receipt.itemId) }} ({{ receiptPackSize }} per pack)</small>
                                            </div>
                                            <div class="fpms-field fpms-col-md-3">
                                                <label for="rpk">Cost per pack (₱)</label>
                                                <input id="rpk" type="number" min="0" step="0.01" class="fpms-control" name="packCost" [(ngModel)]="receipt.packCost" />
                                                <small class="fpms-help fpms-muted">Sets the lot's cost for usage and cycle reports.</small>
                                            </div>
                                        } @else {
                                            <div class="fpms-field fpms-col-md-3">
                                                <label for="rq">Quantity ({{ unitOf(receipt.itemId) }}) <span class="fpms-danger">*</span></label>
                                                <input id="rq" type="number" min="0.001" step="0.001" class="fpms-control" name="quantity" [(ngModel)]="receipt.quantity" required />
                                            </div>
                                            <div class="fpms-field fpms-col-md-3">
                                                <label for="rc">Unit cost (₱ per {{ unitOf(receipt.itemId) }})</label>
                                                <input id="rc" type="number" min="0" step="0.01" class="fpms-control" name="unitCost" [(ngModel)]="receipt.unitCost" />
                                                <small class="fpms-help fpms-muted">Sets the lot's cost for usage and cycle reports.</small>
                                            </div>
                                        }
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="rs">Supplier</label>
                                            <input id="rs" class="fpms-control" name="supplier" [(ngModel)]="receipt.supplier" maxlength="150" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="rn">Note</label>
                                            <input id="rn" class="fpms-control" name="note" [(ngModel)]="receipt.note" maxlength="300" />
                                        </div>
                                    </div>
                                    @if (receiptPackSize) {
                                        <div class="fpms-check fpms-check-switch fpms-space-bottom-2">
                                            <input type="checkbox" class="fpms-check-input" id="inPacks" name="inPacks" [(ngModel)]="receipt.inPacks" />
                                            <label class="fpms-check-label" for="inPacks">Enter in packs</label>
                                        </div>
                                    }
                                    @if (receiptPackSize && receipt.inPacks) {
                                        @if (receipt.packCount > 0 && receipt.packCost > 0) {
                                            <p class="fpms-no-bottom">Total cost: <strong>{{ receipt.packCount * receipt.packCost | php }}</strong></p>
                                        }
                                    } @else if (receipt.quantity > 0 && receipt.unitCost > 0) {
                                        <p class="fpms-no-bottom">Total cost: <strong>{{ receipt.quantity * receipt.unitCost | php }}</strong></p>
                                    }
                                </div>
                                <div class="fpms-panel-foot">
                                    <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !rf.form.valid">Save receipt</button>
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="receipt = null">Cancel</button>
                                    <fpms-form-hint [form]="rf"></fpms-form-hint>
                                </div>
                            </form>
                        </div>
                    </div></div></div>
                }

                <!-- Filters on the page ground, the list in one panel (DEC-107, DEC-110). -->
                <div class="fpms-list-filters">
                        <fpms-list-toolbar
                            placeholder="Search by item, brand or BAI no."
                            [search]="f.search()"
                            [resultText]="f.resultText()"
                            [chips]="f.chips()"
                            [chip]="f.chip()"
                            (searchChange)="f.search.set($event)"
                            (chipChange)="f.chip.set($event)"></fpms-list-toolbar>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!items()) {
                            <fpms-loading></fpms-loading>
                        } @else if (f.noMatch()) {
                            <fpms-empty text="No items match. Clear the search or the filter." icon="fas fa-boxes"></fpms-empty>
                        } @else if (!items().length) {
                            <fpms-empty text="No inventory items yet. Add feed and supplement items, then record opening stock." icon="fas fa-boxes"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <!-- The item with its code first (DEC-98); category, feed type and BAI number under its name (DEC-110). -->
                                    <tr><th scope="col">Item</th><th scope="col" class="fpms-align-end">On hand</th><th scope="col">Stock</th><th scope="col"><span class="fpms-visually-hidden">Actions</span></th></tr>
                                </thead>
                                <tbody>
                                    @for (i of f.visible(); track i.id) {
                                        <tr [class.fpms-row-selected]="selectedItem?.id === i.id" [class.fpms-muted]="!i.isActive">
                                            <td>
                                                <a href="javascript:;" (click)="selectItem(i)">
                                                    @if (i.code) { <span class="fpms-pond-tag fpms-icon-gap">{{ i.code }}</span>{{ i.brand }} {{ i.productName }} } @else { {{ i.displayName }} }
                                                </a>
                                                @if (!i.isActive) { <span> (inactive)</span> }
                                                <div class="fpms-muted">
                                                    {{ i.category | label: L.InventoryCategories }}{{ i.feedType ? ' · ' + i.feedType : '' }}@if (i.baiRegistrationNo) { · <span class="fpms-nowrap">{{ i.baiRegistrationNo }}</span> }
                                                </div>
                                            </td>
                                            <td class="fpms-align-end">{{ i.quantityOnHand | num: 3 : true }} {{ i.unit }}</td>
                                            <td>
                                                @if (i.isNegativeStock) {
                                                    <fpms-badge text="Negative"></fpms-badge>
                                                } @else if (i.isLowStock) {
                                                    <fpms-badge text="Low"></fpms-badge>
                                                } @else {
                                                    <fpms-badge text="OK" tone="success"></fpms-badge>
                                                }
                                            </td>
                                            <td class="fpms-align-end fpms-nowrap">
                                                <button class="fpms-button fpms-button-compact fpms-button-secondary fpms-icon-gap" (click)="selectItem(i)">Lots</button>
                                                @if (canManage) {
                                                    <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startItem(i)">Edit</button>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                </div>

                @if (selectedItem) {
                    <div class="fpms-panel">
                        <div class="fpms-panel-head fpms-flex">
                            <h3 class="fpms-panel-title fpms-margin-auto-end">Lots of {{ selectedItem.displayName }}</h3>
                            <button class="fpms-button fpms-button-compact fpms-button-secondary" (click)="selectedItem = null; lots.set(null); movements.set(null)">Close</button>
                        </div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead>
                                    <tr><th scope="col">Lot · received</th><th scope="col">Expiry</th><th scope="col">Supplier</th><th scope="col" class="fpms-align-end">Unit cost</th><th scope="col" class="fpms-align-end">On hand</th><th scope="col"><span class="fpms-visually-hidden">Actions</span></th></tr>
                                </thead>
                                <tbody>
                                    @for (l of lots() ?? []; track l.id) {
                                        <tr [class.fpms-row-selected]="selectedLot?.id === l.id">
                                            <td>
                                                <a class="fpms-nowrap" href="javascript:;" (click)="selectLot(l)" title="Show this lot's movements">{{ l.lotNumber }}</a>
                                                <div class="fpms-muted">received {{ l.receivedDate | farmDate }}</div>
                                            </td>
                                            <td class="fpms-nowrap" [class.fpms-danger]="l.isExpired">{{ l.expiryDate | farmDate }}@if (l.isExpired) { <div>expired</div> }</td>
                                            <td>{{ l.supplier }}</td>
                                            <td class="fpms-align-end">{{ l.unitCost | php }}</td>
                                            <td class="fpms-align-end fpms-nowrap" [class.fpms-danger]="l.isNegative">
                                                {{ l.quantityOnHand | num: 3 : true }} {{ l.unit }}
                                                @if (l.isNegative || l.needsReconciliation) {
                                                    <div class="fpms-badge-stack fpms-space-top-1">
                                                        @if (l.isNegative) { <fpms-badge text="Negative"></fpms-badge> }
                                                        @if (l.needsReconciliation) { <fpms-badge text="Reconcile"></fpms-badge> }
                                                    </div>
                                                }
                                            </td>
                                            <!-- The lot number opens its movements; the stock actions stack (DEC-110). -->
                                            <td class="fpms-align-end">
                                                @if (canManage) {
                                                    <div class="fpms-actions-stack">
                                                        <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startAdjust(l)">Adjust</button>
                                                        @if (l.needsReconciliation) {
                                                            <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="clearFlag(l)">Mark reconciled</button>
                                                        }
                                                    </div>
                                                }
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="6" class="fpms-muted fpms-align-center fpms-space-y-3">No lots yet. Record a receipt to add stock.</td></tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                }

                @if (adjust) {
                    <div class="fpms-dialog-backdrop">
                        <div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title">
                            <div class="fpms-dialog-body fpms-space-0">
                                <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                                    <div class="fpms-panel-head">
                                        <h3 id="inventory-adjust-title" class="fpms-panel-title">
                                            Adjust lot {{ adjust.lot.lotNumber }} (on hand {{ adjust.lot.quantityOnHand | num: 3 }} {{ adjust.lot.unit }})
                                        </h3>
                                    </div>
                                    <form #af="ngForm" (ngSubmit)="saveAdjust()" fpmsReview="adjustment" [fpmsReviewNew]="true" novalidate>
                                        <div class="fpms-panel-body">
                                            <div class="fpms-grid-row">
                                                <div class="fpms-field fpms-col-md-3">
                                                    <label for="aq">Quantity change ({{ adjust.lot.unit }}) <span class="fpms-danger">*</span></label>
                                                    <input id="aq" type="number" step="0.001" class="fpms-control" name="quantity" [(ngModel)]="adjust.quantity" required />
                                                    <small class="fpms-help fpms-muted">Positive adds stock; negative removes it.</small>
                                                </div>
                                                <div class="fpms-field fpms-col-md-3">
                                                    <label for="ad">Date</label>
                                                    <input id="ad" type="date" class="fpms-control" name="date" [(ngModel)]="adjust.date" [max]="today" />
                                                </div>
                                                <div class="fpms-field fpms-col-md-6">
                                                    <label for="ar">Reason <span class="fpms-danger">*</span></label>
                                                    <input id="ar" class="fpms-control" name="reason" [(ngModel)]="adjust.reason" required maxlength="300" placeholder="e.g. physical count, spoilage, opening balance" />
                                                </div>
                                            </div>
                                            @if (adjust.quantity) {
                                                <p class="fpms-no-bottom">New balance: <strong>{{ adjust.lot.quantityOnHand + adjust.quantity | num: 3 }} {{ adjust.lot.unit }}</strong></p>
                                            }
                                        </div>
                                        <div class="fpms-panel-foot">
                                            <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !af.form.valid || !adjust.quantity">Save adjustment</button>
                                            <button type="button" class="fpms-button fpms-button-secondary" (click)="adjust = null">Cancel</button>
                                            <fpms-form-hint [form]="af"></fpms-form-hint>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                }

                @if (selectedLot && movements()) {
                    <div class="fpms-panel">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Movement ledger: lot {{ selectedLot.lotNumber }}</h3></div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead>
                                    <tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col" class="fpms-align-end">Quantity</th><th scope="col" class="fpms-align-end">Unit cost</th><th scope="col" class="fpms-align-end">Balance</th><th scope="col">Batch</th><th scope="col">Source / reason</th><th scope="col">By</th></tr>
                                </thead>
                                <tbody>
                                    @for (m of movements(); track m.id) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ m.movementDateUtc | farmDateTime }}</td>
                                            <td>{{ m.type | label: L.MovementTypes }}</td>
                                            <td class="fpms-align-end" [class.fpms-danger]="m.quantity < 0">{{ m.quantity | num: 3 }}</td>
                                            <td class="fpms-align-end">{{ m.unitCost | php }}</td>
                                            <td class="fpms-align-end">{{ m.runningBalance | num: 3 }}</td>
                                            <td>
                                                @if (m.batchId) {
                                                    <a [routerLink]="['/app/production/batches', m.batchId]">{{ m.batchCode }}</a>
                                                }
                                            </td>
                                            <td class="fpms-small">{{ m.source }}{{ m.source && m.reason ? ' · ' : '' }}{{ m.reason }}</td>
                                            <td class="fpms-small fpms-muted">{{ m.recordedBy }}</td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="8" class="fpms-align-center fpms-muted fpms-space-y-3">No movements.</td></tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        <div class="fpms-panel-foot fpms-small fpms-muted">Movements are never edited. Corrections are recorded as adjustments with a reason.</div>
                    </div>
                }
            </div>
        </section>
    `,
})
export class InventoryComponent extends FpmsPage implements OnInit {
    readonly empty = EMPTY_GUID;
    readonly units = InventoryUnits;
    items = signal<any[] | null>(null);
    f = new ClientListFilter<any>(
        () => this.items(),
        (i) => [i.displayName, i.brand, i.productName, i.baiRegistrationNo, i.feedType],
        (i) => i.category,
        Object.entries(this.L.InventoryCategories).map(([value, label]) => ({ value: Number(value), label: label as string })),
        'All items',
        ['item', 'items']
    );
    activeItems = signal<any[]>([]);
    lots = signal<any[] | null>(null);
    movements = signal<any[] | null>(null);
    selectedItem: any = null;
    selectedLot: any = null;
    itemForm: any = null;
    receipt: any = null;
    adjust: any = null;

    get canManage(): boolean {
        return this.can('Farm.Inventory.Manage');
    }

    ngOnInit(): void {
        this.loadItems();
    }

    async loadItems(): Promise<void> {
        const list = await this.api.get<any[]>('Inventory', 'GetItems');
        this.items.set(list);
        this.activeItems.set(list.filter((i) => i.isActive));
        if (this.selectedItem) {
            this.selectedItem = list.find((i) => i.id === this.selectedItem.id) ?? null;
        }
    }

    unitOf(itemId: string): string {
        return this.items()?.find((i) => i.id === itemId)?.unit ?? '';
    }

    async selectItem(i: any): Promise<void> {
        this.selectedItem = i;
        this.selectedLot = null;
        this.movements.set(null);
        this.lots.set(await this.api.get<any[]>('Inventory', 'GetLots', { itemId: i.id }));
    }

    async selectLot(l: any): Promise<void> {
        this.selectedLot = l;
        this.movements.set(await this.api.get<any[]>('Inventory', 'GetMovements', { lotId: l.id }));
    }

    startItem(i?: any): void {
        this.receipt = null;
        this.itemForm = i ? { ...i } : { id: EMPTY_GUID, category: 1, brand: '', productName: '', unit: 'kg', isActive: true };
    }

    async saveItem(): Promise<void> {
        if (await this.act(() => this.api.post('Inventory', 'SaveItem', this.itemForm))) {
            this.notifySaved('Item saved.');
            this.itemForm = null;
            this.loadItems();
        }
    }

    startReceipt(): void {
        this.itemForm = null;
        this.receipt = {
            itemId: this.selectedItem?.id ?? this.activeItems()[0]?.id ?? '',
            lotNumber: '',
            receivedDate: this.today,
            expiryDate: '',
            supplier: '',
            quantity: null,
            unitCost: null,
            note: '',
            inPacks: true,
            packCount: null,
            packCost: null,
        };
    }

    get receiptPackSize(): number | null {
        return this.items()?.find((i) => i.id === this.receipt?.itemId)?.packSize ?? null;
    }

    async saveReceipt(): Promise<void> {
        const packs = !!this.receiptPackSize && this.receipt.inPacks;
        const body = {
            ...this.receipt,
            expiryDate: this.receipt.expiryDate || null,
            quantity: packs ? 0 : this.receipt.quantity,
            unitCost: packs ? null : this.receipt.unitCost,
            packCount: packs ? this.receipt.packCount : null,
            packCost: packs ? this.receipt.packCost : null,
        };
        let result: any;
        if (await this.act(async () => (result = await this.api.post<any>('Inventory', 'RecordReceipt', body)))) {
            this.notifySaved('Receipt saved.');
            const item = this.items()?.find((i) => i.id === body.itemId);
            this.receipt = null;
            await this.loadItems();
            if (item) {
                this.selectItem(this.items().find((i) => i.id === item.id));
            }
        }
    }

    startAdjust(l: any): void {
        this.adjust = { lot: l, quantity: null, reason: '', date: this.today };
    }

    async saveAdjust(): Promise<void> {
        const a = this.adjust;
        if (await this.act(() => this.api.post('Inventory', 'RecordAdjustment', { lotId: a.lot.id, quantity: a.quantity, reason: a.reason, date: a.date || null }))) {
            this.notifySaved('Adjustment recorded.');
            this.adjust = null;
            await this.loadItems();
            await this.selectItem(this.selectedItem);
            const lot = this.lots()?.find((x) => x.id === a.lot.id);
            if (lot) {
                this.selectLot(lot);
            }
        }
    }

    async clearFlag(l: any): Promise<void> {
        if (await this.act(() => this.api.post('Inventory', 'ClearReconciliationFlag', { id: l.id }))) {
            this.selectItem(this.selectedItem);
        }
    }

    /** Whether a folded item field holds something, so its section opens by itself (DEC-96). */
    hasItemExtras(): boolean {
        return [this.itemForm?.brand, this.itemForm?.feedType, this.itemForm?.baiRegistrationNo, this.itemForm?.reorderLevel, this.itemForm?.activeIngredient].some((v) => v != null && v !== '');
    }
}
