import { PHONE_MESSAGE, tidyPhone } from '@shared/fpms/phone';
import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';
import { ClientListFilter } from '@shared/fpms/client-list';

/** Buyer Information Management (Ref 7.2). Owner only. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Buyers" subtitle="Harvest buyers and their sales history.">
            <button class="fpms-button fpms-button-primary" (click)="startEdit()" [disabled]="!!form"><i class="fas fa-plus fpms-icon-gap"></i>Add buyer</button>
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (form) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="buyer-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head"><h3 id="buyer-dialog-title" class="fpms-panel-title">{{ form.id === empty ? 'New buyer' : 'Edit ' + form.name }}</h3></div>
                            <form #f="ngForm" (ngSubmit)="save()" fpmsReview="buyer" [fpmsReviewNew]="form.id === empty" novalidate>
                                <div class="fpms-panel-body">
                                    <div class="fpms-field">
                                        <span class="fpms-block fpms-space-bottom-1">Buyer type <span class="fpms-danger">*</span></span>
                                        @for (o of Options.buyerType; track o.value) {
                                            <div class="fpms-check fpms-check-radio fpms-check-inline">
                                                <input type="radio" class="fpms-check-input" [id]="'bt' + o.value" name="buyerType" [value]="o.value" [(ngModel)]="form.buyerType" />
                                                <label class="fpms-check-label" [for]="'bt' + o.value">{{ o.label }}</label>
                                            </div>
                                        }
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-5">
                                            <label for="cn">{{ form.buyerType === 1 ? 'Full name' : 'Company name' }} <span class="fpms-danger">*</span></label>
                                            <input id="cn" class="fpms-control" name="name" [(ngModel)]="form.name" required maxlength="150" />
                                        </div>
                                        @if (form.buyerType === 2) {
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="cp">Contact person</label>
                                                <input id="cp" class="fpms-control" name="contactPerson" [(ngModel)]="form.contactPerson" maxlength="100" />
                                            </div>
                                        }
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="ph">Phone</label>
                                            <input id="ph" fpmsPhone class="fpms-control" [class.is-invalid]="ph.invalid && ph.touched" name="phone" [(ngModel)]="form.phone" #ph="ngModel" aria-describedby="phHelp" />
                                            <small id="phHelp" class="fpms-help" [class.fpms-danger]="ph.invalid && ph.touched" [class.fpms-muted]="!(ph.invalid && ph.touched)">{{ ph.invalid && ph.touched ? PHONE_MESSAGE : 'Optional. Mobile 0917 123 4567 or landline (083) 552 1234.' }}</small>
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-9">
                                            <label for="ad">Address</label>
                                            <input id="ad" class="fpms-control" name="address" [(ngModel)]="form.address" maxlength="300" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-3 fpms-check-cell">
                                            <div class="fpms-check fpms-check-box">
                                                <input type="checkbox" class="fpms-check-input" id="act" name="isActive" [(ngModel)]="form.isActive" />
                                                <label class="fpms-check-label" for="act">Active</label>
                                            </div>
                                        </div>
                                    </div>
                                    @if (form.buyerType === 1) {
                                        <div class="fpms-check fpms-check-box">
                                            <input type="checkbox" class="fpms-check-input" id="pn" name="privacyNoticeAcknowledged" [(ngModel)]="form.privacyNoticeAcknowledged" [disabled]="!!form.privacyNoticeAcknowledgedAtUtc" required />
                                            <label class="fpms-check-label" for="pn">
                                                I told this buyer that their name and contact details are kept for the farm's sales records (Data Privacy Act of 2012). <span class="fpms-danger">*</span>
                                            </label>
                                            @if (form.privacyNoticeAcknowledgedAtUtc) {
                                                <small class="fpms-help fpms-muted">Confirmed {{ form.privacyNoticeAcknowledgedAtUtc | farmDateTime }}.</small>
                                            }
                                        </div>
                                    }
                                </div>
                                <div class="fpms-panel-foot">
                                    <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !f.form.valid">Save</button>
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="form = null">Cancel</button>
                                    <fpms-form-hint [form]="f"></fpms-form-hint>
                                </div>
                            </form>
                        </div>
                    </div></div></div>
                }
                <!-- Filters on the page ground, the list in one panel; four columns that each hold what belongs together, so the list fits 1,000 px (DEC-112). -->
                <div class="fpms-list-filters">
                    <fpms-list-toolbar
                        placeholder="Search by buyer, contact or phone"
                        [search]="f.search()"
                        [resultText]="f.resultText()"
                        [chips]="f.chips()"
                        [chip]="f.chip()"
                        (searchChange)="f.search.set($event)"
                        (chipChange)="f.chip.set($event)"></fpms-list-toolbar>
                </div>
                @if (detail(); as d) {
                    <div class="fpms-panel">
                        <div class="fpms-panel-head fpms-flex align-items-center">
                            <h3 class="fpms-panel-title fpms-margin-auto-end">Sales to {{ d.name }}</h3>
                            <button class="fpms-button fpms-button-compact fpms-button-secondary" (click)="detail.set(null)">Close</button>
                        </div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th scope="col">Date · receipt</th><th scope="col" class="fpms-align-end">Kg</th><th scope="col" class="fpms-align-end">Amount</th><th scope="col">Payment</th></tr></thead>
                                <tbody>
                                    @for (s of d.sales; track s.id) {
                                        <tr>
                                            <td class="fpms-nowrap"><a [routerLink]="['/app/sales', s.id]">{{ s.saleDate | farmDate }}</a><div class="fpms-muted">{{ s.dispatchReceiptNo || 'No receipt no.' }}</div></td>
                                            <td class="fpms-align-end">{{ s.totalKg | num: 2 }}</td>
                                            <td class="fpms-align-end">{{ s.totalAmount | php }}</td>
                                            <td class="fpms-badge-stack"><fpms-badge [text]="s.paymentStatus | label: L.PaymentStatuses"></fpms-badge>@if (s.isOverdue) { <fpms-badge text="Overdue" tone="danger"></fpms-badge> }</td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="4" class="fpms-align-center fpms-muted fpms-space-y-3">No sales to this buyer yet.</td></tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                }
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!list()) {
                            <fpms-loading></fpms-loading>
                        } @else if (f.noMatch()) {
                            <fpms-empty text="No buyers match. Clear the search or the filter." icon="fas fa-handshake"></fpms-empty>
                        } @else if (!list().length) {
                            <fpms-empty text="No buyers yet. Add buyers before recording sales." icon="fas fa-handshake"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <tr><th scope="col">Buyer</th><th scope="col">Contact</th><th scope="col" class="fpms-align-end">Sales</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
                                </thead>
                                <tbody>
                                    @for (b of f.visible(); track b.id) {
                                        <tr [class.fpms-muted]="!b.isActive" [class.fpms-row-selected]="detail()?.id === b.id">
                                            <td>
                                                <strong>{{ b.name }}</strong>
                                                <div class="fpms-muted">{{ b.buyerType | label: L.BuyerTypes }}{{ b.address ? ' · ' + b.address : '' }}</div>
                                            </td>
                                            <td>
                                                {{ b.contactPerson || (b.buyerType === 1 ? 'The buyer' : '—') }}
                                                <div class="fpms-muted fpms-nowrap">{{ b.phone || 'No phone' }}</div>
                                            </td>
                                            <td class="fpms-align-end fpms-nowrap">
                                                {{ b.totalSales | php }}
                                                <div class="fpms-muted">{{ b.saleCount === 1 ? '1 sale' : (b.saleCount | num: 0) + ' sales' }}</div>
                                            </td>
                                            <td><fpms-badge [text]="b.isActive ? 'Active' : 'Inactive'" [tone]="b.isActive ? 'success' : 'secondary'"></fpms-badge></td>
                                            <td class="fpms-align-end">
                                                <div class="fpms-actions-stack">
                                                    <button class="fpms-button fpms-button-compact fpms-button-secondary" (click)="showSales(b)" [attr.aria-label]="'Sales to ' + b.name">Sales</button>
                                                    <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startEdit(b)" [attr.aria-label]="'Edit ' + b.name">Edit</button>
                                                    <button class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy()" (click)="toggle(b)">{{ b.isActive ? 'Deactivate' : 'Reactivate' }}</button>
                                                </div>
                                            </td>
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
export class BuyersComponent extends FpmsPage implements OnInit {
    readonly PHONE_MESSAGE = PHONE_MESSAGE;
    readonly empty = EMPTY_GUID;
    list = signal<any[] | null>(null);
    f = new ClientListFilter<any>(
        () => this.list(),
        (b) => [b.name, b.contactPerson, b.phone, b.address],
        (b) => (b.isActive ? 'active' : 'inactive'),
        [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
        'All buyers',
        ['buyer', 'buyers']
    );
    detail = signal<any>(null);
    form: any = null;

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.list.set(await this.api.get<any[]>('Buyer', 'GetAll'));
    }

    async showSales(b: any): Promise<void> {
        this.detail.set(await this.api.get<any>('Buyer', 'Get', { id: b.id }));
    }

    startEdit(b?: any): void {
        this.form = b ? { ...b, phone: tidyPhone(b.phone) } : { id: EMPTY_GUID, buyerType: 2, name: '', contactPerson: '', phone: '', address: '', isActive: true, privacyNoticeAcknowledged: false };
    }

    async save(): Promise<void> {
        if (await this.act(() => this.api.post('Buyer', 'Save', this.form))) {
            this.notifySaved('Buyer saved.');
            this.form = null;
            this.load();
        }
    }

    /** Deactivate or reactivate; easy to reverse, so it acts at once and offers Undo (DEC-116). */
    async toggle(b: any, undoing = false): Promise<void> {
        if (await this.act(() => this.api.post('Buyer', 'SetActive', { id: b.id, isActive: !b.isActive }))) {
            if (!undoing) {
                this.notifySaved(`${b.name} ${b.isActive ? 'deactivated' : 'reactivated'}.`, () => this.toggle({ ...b, isActive: !b.isActive }, true));
            }
            this.load();
        }
    }
}
