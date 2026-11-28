import { PHONE_MESSAGE, tidyPhone } from '@shared/fpms/phone';
import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { EMPTY_GUID } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';
import { ClientListFilter } from '@shared/fpms/client-list';

/** Hatchery Source Management (Ref 3.1). Owners manage; Technicians read. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Hatchery sources" subtitle="Hatcheries that supply your fry and PL, with their accreditation and health certificates.">
            @if (canManage) {
                <button class="fpms-button fpms-button-primary" (click)="startEdit()" [disabled]="!!form"><i class="fas fa-plus fpms-icon-gap"></i>Add hatchery</button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (form) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="hatchery-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head"><h3 id="hatchery-dialog-title" class="fpms-panel-title">{{ form.id === empty ? 'New hatchery source' : 'Edit ' + form.name }}</h3></div>
                            <form #f="ngForm" (ngSubmit)="save()" fpmsReview="hatchery" [fpmsReviewNew]="form.id === empty" novalidate>
                                <div class="fpms-panel-body">
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-8">
                                            <label for="n">Name <span class="fpms-danger">*</span></label>
                                            <input id="n" class="fpms-control" name="name" [(ngModel)]="form.name" (blur)="suggestCode()" required maxlength="150" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="sc">Short code <span class="fpms-danger">*</span></label>
                                            <input id="sc" class="fpms-control fpms-uppercase" name="shortCode" [(ngModel)]="form.shortCode" required maxlength="6" pattern="[A-Za-z]{2,6}" [placeholder]="suggestedCode" [disabled]="form.cycleCount > 0" />
                                            <small class="fpms-help fpms-muted">{{ form.cycleCount > 0 ? 'Fixed: used in cycle codes.' : '2–6 letters, used in cycle codes.' }}</small>
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-12">
                                            <label for="a">Address <span class="fpms-danger">*</span></label>
                                            <input id="a" class="fpms-control" name="address" [(ngModel)]="form.address" required maxlength="300" />
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="cp">Contact person</label>
                                            <input id="cp" class="fpms-control" name="contactPerson" [(ngModel)]="form.contactPerson" maxlength="100" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="ph">Phone <span class="fpms-danger">*</span></label>
                                            <input id="ph" fpmsPhone class="fpms-control" [class.is-invalid]="ph.invalid && ph.touched" name="phone" [(ngModel)]="form.phone" required #ph="ngModel" aria-describedby="phHelp" />
                                            <small id="phHelp" class="fpms-help" [class.fpms-danger]="ph.invalid && ph.touched" [class.fpms-muted]="!(ph.invalid && ph.touched)">{{ ph.invalid && ph.touched ? PHONE_MESSAGE : 'Mobile 0917 123 4567 or landline (083) 552 1234.' }}</small>
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="acc">BFAR accreditation no.</label>
                                            <input id="acc" class="fpms-control" name="bfarAccreditationNo" [(ngModel)]="form.bfarAccreditationNo" maxlength="100" />
                                        </div>
                                    </div>
                                    @if (form.id === empty) {
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="hc">Health certificate no.</label>
                                            <input id="hc" class="fpms-control" name="certificateNo" [(ngModel)]="cert.certificateNo" maxlength="100" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="hi">Issued</label>
                                            <input id="hi" type="date" class="fpms-control" name="issueDate" [(ngModel)]="cert.issueDate" [max]="today" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="he">Expires</label>
                                            <input id="he" type="date" class="fpms-control" name="expiryDate" [(ngModel)]="cert.expiryDate" />
                                        </div>
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
                        @if (form.id !== empty && detail()) {
                            <div class="fpms-panel">
                                <div class="fpms-panel-head"><h3 class="fpms-panel-title">Certificates</h3></div>
                                <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                                    <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                        <thead><tr><th scope="col">Certificate</th><th scope="col">Valid</th><th scope="col">Status</th><th scope="col">Recorded by</th><th scope="col"><span class="fpms-visually-hidden">Actions</span></th></tr></thead>
                                        <tbody>
                                            @for (c of detail().certificates; track c.id) {
                                                <tr>
                                                    <td>{{ c.certificateNo }}<div class="fpms-muted">{{ c.certificateType | label: L.CertificateTypes }}</div></td>
                                                    <td class="fpms-nowrap">{{ c.issueDate ? (c.issueDate | farmDate) : 'Issue date not given' }}<div class="fpms-muted">{{ c.expiryDate ? 'to ' + (c.expiryDate | farmDate) : 'No expiry date' }}</div></td>
                                                    <td>
                                                        @if (c.isCurrent) {
                                                            <fpms-badge text="Current" tone="success"></fpms-badge>
                                                        } @else if (c.isExpired) {
                                                            <fpms-badge text="Expired" tone="danger"></fpms-badge>
                                                        } @else {
                                                            <span class="fpms-muted">Earlier</span>
                                                        }
                                                    </td>
                                                    <td>{{ c.recordedBy }}</td>
                                                    <td class="fpms-align-end">
                                                        <button class="fpms-button fpms-button-compact fpms-button-danger" [disabled]="busy()" (click)="removeCertificate(c)" [title]="'Remove certificate ' + c.certificateNo + ', entered by mistake'">Remove</button>
                                                    </td>
                                                </tr>
                                            } @empty {
                                                <tr><td colspan="5" class="fpms-muted fpms-align-center fpms-space-y-2">No certificates yet.</td></tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                                <form class="fpms-panel-foot" #cf="ngForm" (ngSubmit)="addCertificate()" fpmsReview="certificate" [fpmsReviewNew]="true" novalidate>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="ct">Type</label>
                                            <select id="ct" class="fpms-control" name="certificateType" [(ngModel)]="cert.certificateType">
                                                @for (o of Options.certificateType; track o.value) {
                                                    <option [ngValue]="o.value">{{ o.label }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="cn">Number <span class="fpms-danger">*</span></label>
                                            <input id="cn" class="fpms-control" name="certificateNo" [(ngModel)]="cert.certificateNo" required maxlength="100" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="ci">Issued</label>
                                            <input id="ci" type="date" class="fpms-control" name="issueDate" [(ngModel)]="cert.issueDate" [max]="today" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-3">
                                            <label for="ce">Expires</label>
                                            <input id="ce" type="date" class="fpms-control" name="expiryDate" [(ngModel)]="cert.expiryDate" />
                                        </div>
                                    </div>
                                    <div class="fpms-flex fpms-wrap fpms-align-center-items">
                                        <button type="submit" class="fpms-button fpms-button-primary fpms-space-end-3" [disabled]="busy() || !cf.form.valid">Add certificate</button>
                                        <span class="fpms-muted fpms-space-end-3">A renewal is a new certificate; earlier ones stay in the history.</span>
                                        <fpms-form-hint [form]="cf"></fpms-form-hint>
                                    </div>
                                </form>
                            </div>
                        }
                    </div></div></div>
                }
                <!-- Filters on the page ground, the list in one panel; columns that each hold what belongs together, so the list fits 1,000 px (DEC-112). -->
                <div class="fpms-list-filters">
                    <fpms-list-toolbar
                        placeholder="Search by name, contact or accreditation no."
                        [search]="f.search()"
                        [resultText]="f.resultText()"
                        [chips]="f.chips()"
                        [chip]="f.chip()"
                        (searchChange)="f.search.set($event)"
                        (chipChange)="f.chip.set($event)"></fpms-list-toolbar>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!list()) {
                            <fpms-loading></fpms-loading>
                        } @else if (f.noMatch()) {
                            <fpms-empty text="No hatchery sources match. Clear the search or the filter." icon="fas fa-egg"></fpms-empty>
                        } @else if (!list().length) {
                            <fpms-empty text="No hatchery sources yet. A production cycle needs one." icon="fas fa-egg"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <tr><th scope="col">Hatchery · contact</th><th scope="col" title="BFAR accreditation and the current health certificate">Papers</th><th scope="col">Used in</th>@if (canManage) {<th scope="col"><span class="fpms-visually-hidden">Actions</span></th>}</tr>
                                </thead>
                                <tbody>
                                    @for (h of f.visible(); track h.id) {
                                        <tr>
                                            <td>
                                                <span class="fpms-pond-tag fpms-icon-gap" title="Short code, used in cycle codes">{{ h.shortCode }}</span><strong>{{ h.name }}</strong>
                                                <div class="fpms-muted">{{ h.address }}</div>
                                                <div>{{ h.contactPerson ? h.contactPerson + ' · ' : '' }}<span class="fpms-nowrap">{{ h.phone || 'No phone' }}</span></div>
                                            </td>
                                            <td>
                                                <fpms-badge [text]="h.accreditationStatus | label: L.AccreditationStatuses"></fpms-badge>
                                                <div class="fpms-muted fpms-nowrap">{{ h.bfarAccreditationNo || 'No BFAR no.' }}</div>
                                                @if (h.healthCertificateNo) {
                                                    <div class="fpms-nowrap" [class.fpms-danger]="h.isCertificateExpired">
                                                        @if (h.isCertificateExpired) { <i class="fas fa-exclamation-circle fpms-icon-gap" aria-hidden="true"></i> }
                                                        Health cert. {{ h.healthCertificateNo }}
                                                    </div>
                                                    @if (h.healthCertificateExpiry) {
                                                        <div class="fpms-nowrap" [class.fpms-danger]="h.isCertificateExpired" [class.fpms-muted]="!h.isCertificateExpired">
                                                            {{ h.isCertificateExpired ? 'Expired' : 'Expires' }} {{ h.healthCertificateExpiry | farmDate }}
                                                        </div>
                                                    }
                                                } @else {
                                                    <div class="fpms-muted">No health certificate recorded</div>
                                                }
                                            </td>
                                            <td>
                                                <div class="fpms-muted fpms-nowrap">{{ h.cycleCount === 1 ? '1 cycle' : h.cycleCount + ' cycles' }}</div>
                                            </td>
                                            @if (canManage) {
                                                <td class="fpms-align-end">
                                                    <div class="fpms-actions-stack">
                                                        <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startEdit(h)" [attr.aria-label]="'Edit ' + h.name">Edit</button>
                                                    </div>
                                                </td>
                                            }
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
export class HatcheriesComponent extends FpmsPage implements OnInit {
    readonly PHONE_MESSAGE = PHONE_MESSAGE;
    readonly empty = EMPTY_GUID;
    list = signal<any[] | null>(null);
    f = new ClientListFilter<any>(
        () => this.list(),
        (h) => [h.name, h.shortCode, h.contactPerson, h.phone, h.address, h.bfarAccreditationNo],
        () => null,
        [],
        'All sources',
        ['hatchery source', 'hatchery sources']
    );
    detail = signal<any | null>(null);
    form: any = null;
    cert: any = this.blankCertificate();

    /** Same rule as the API: initials of the name's words, at least two letters. */
    get suggestedCode(): string {
        const name: string = this.form?.name ?? '';
        let code = (name.match(/(^|[\s(\-/])[A-Za-z]/g) ?? []).map((m) => m.slice(-1).toUpperCase()).join('').slice(0, 6);
        if (code.length < 2) {
            code = (name.replace(/[^A-Za-z]/g, '').toUpperCase() + 'XX').slice(0, 2);
        }
        return name ? code : 'e.g. SHI';
    }

    blankCertificate(): any {
        return { certificateType: 1, certificateNo: '', issueDate: '', expiryDate: '' };
    }

    get canManage(): boolean {
        return this.can('Farm.Hatcheries.Manage');
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.list.set(await this.api.get<any[]>('Hatchery', 'GetAll'));
    }

    async startEdit(h?: any): Promise<void> {
        this.cert = this.blankCertificate();
        this.detail.set(null);
        this.form = h ? { ...h, phone: tidyPhone(h.phone) } : { id: EMPTY_GUID, name: '', shortCode: '', accreditationStatus: 4, cycleCount: 0 };
        if (h) {
            this.detail.set(await this.api.get<any>('Hatchery', 'Get', { id: h.id }));
        }
    }

    private certificateBody(hatcheryId: string): any {
        return { ...this.cert, hatcheryId, issueDate: this.cert.issueDate || null, expiryDate: this.cert.expiryDate || null };
    }

    /** A new hatchery gets its name's initials as a starting short code, which the user can change. */
    suggestCode(): void {
        if (this.form?.id === EMPTY_GUID && !this.form.shortCode?.trim() && this.form.name?.trim()) {
            this.form.shortCode = this.suggestedCode;
        }
    }

    async save(): Promise<void> {
        const isNew = this.form.id === EMPTY_GUID;
        let id: string;
        if (await this.act(async () => {
            id = await this.api.post<string>('Hatchery', 'Save', { ...this.form, shortCode: (this.form.shortCode ?? '').trim().toUpperCase() });
            if (isNew && this.cert.certificateNo?.trim()) {
                await this.api.post('Hatchery', 'AddCertificate', this.certificateBody(id));
            }
        })) {
            this.notifySaved('Hatchery source saved.');
            this.form = null;
            this.load();
        }
    }

    async addCertificate(): Promise<void> {
        if (await this.act(() => this.api.post('Hatchery', 'AddCertificate', this.certificateBody(this.form.id)))) {
            this.notifySaved('Certificate added.');
            this.cert = this.blankCertificate();
            this.detail.set(await this.api.get<any>('Hatchery', 'Get', { id: this.form.id }));
            this.load();
        }
    }

    async removeCertificate(c: any): Promise<void> {
        if (!(await this.confirm('Use this only for a certificate entered by mistake. Renewals are added as new certificates.', `Remove certificate ${c.certificateNo}?`, { confirmText: 'Remove certificate' }))) {
            return;
        }
        if (await this.act(() => this.api.delete('Hatchery', 'DeleteCertificate', { id: c.id }))) {
            this.detail.set(await this.api.get<any>('Hatchery', 'Get', { id: this.form.id }));
            this.load();
        }
    }
}
