import { PHONE_MESSAGE, tidyPhone } from '@shared/fpms/phone';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FormDrafts } from '@shared/fpms/drafts';
import { LAST_FARM_CODE_KEY } from '@shared/auth/app-auth.service';
import { FPMS_IMPORTS } from '../shared-imports';
import { applyCoverageBarangay, applyCoverageCity, applyCoverageProvince, coverageBarangays, coverageCities, coverageProvinces } from '@shared/fpms/coverage-area';

/** Farm Profile Management (Ref 2.1, D-31). Owners edit; Technicians read. Pond specifications are managed on the Ponds page. */
const PROFILE_DRAFT = 'farm-profile';

@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header [narrow]="true" title="Farm profile" subtitle="Farm identity, location and contact information."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner fpms-narrow">
                @if (!p) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @if (!canEdit) {
                        <div class="fpms-panel">
                            <div class="fpms-panel-head"><h3 class="fpms-panel-title">Farm details</h3></div>
                            <div class="fpms-panel-body">
                                <dl class="fpms-grid-row fpms-no-bottom fpms-dl">
                                    <dt class="fpms-col-sm-4">Farm ID</dt><dd class="fpms-col-sm-8">
                                        @if (p.farmId) { <code>{{ p.farmId }}</code><span class="fpms-none fpms-space-start-2">{{ p.cityMunicipality }}{{ p.addressLine2 ? ', ' + p.addressLine2 : '' }}</span> } @else { <span class="fpms-none">—</span> }
                                        <div class="fpms-small fpms-none">{{ p.lotCodeNote }}</div>
                                    </dd>
                                    <dt class="fpms-col-sm-4">Farm code</dt><dd class="fpms-col-sm-8"><code>{{ p.farmCode }}</code><span class="fpms-none fpms-space-start-2">used with your username to sign in</span></dd>
                                    <dt class="fpms-col-sm-4">Farm name</dt><dd class="fpms-col-sm-8">{{ p.farmName }}</dd>
                                    <dt class="fpms-col-sm-4">Total farm area</dt>
                                    <dd class="fpms-col-sm-8">
                                        @if (p.totalAreaHectares) { {{ p.totalAreaHectares | num: 2 }} ha } @else { <span class="fpms-none">—</span> }
                                        <span class="fpms-none fpms-icon-gap">· ponds on record {{ p.pondAreaHectares | num: 2 }} ha</span>
                                    </dd>
                                    <dt class="fpms-col-sm-4">Address</dt><dd class="fpms-col-sm-8">{{ p.fullAddress || '—' }}</dd>
                                    <dt class="fpms-col-sm-4">Harvest lot code</dt>
                                    <dd class="fpms-col-sm-8">
                                        @if (p.lotCodeParts) { <code>YY-{{ p.lotCodeParts }}-PP-HH</code> }
                                        <div class="fpms-small" [class.fpms-warning-text]="!p.lotCodeParts" [class.fpms-none]="p.lotCodeParts">{{ p.lotCodeNote }}</div>
                                    </dd>
                                    <dt class="fpms-col-sm-4">Coordinates</dt>
                                    <dd class="fpms-col-sm-8">
                                        @if (p.latitude != null && p.longitude != null) { {{ p.latitude | num: 6 }}, {{ p.longitude | num: 6 }} } @else { <span class="fpms-none">—</span> }
                                    </dd>
                                </dl>
                            </div>
                        </div>
                        <div class="fpms-panel">
                            <div class="fpms-panel-head"><h3 class="fpms-panel-title">Contact</h3></div>
                            <div class="fpms-panel-body">
                                <dl class="fpms-grid-row fpms-no-bottom fpms-dl">
                                    <dt class="fpms-col-sm-4">Contact person</dt><dd class="fpms-col-sm-8">{{ p.contactName || '—' }}</dd>
                                    <dt class="fpms-col-sm-4">Phone</dt><dd class="fpms-col-sm-8">{{ p.contactPhone || '—' }}</dd>
                                    <dt class="fpms-col-sm-4">Email</dt><dd class="fpms-col-sm-8">{{ p.contactEmail || '—' }}</dd>
                                </dl>
                            </div>
                        </div>
                        <p class="fpms-muted fpms-small"><i class="fas fa-lock fpms-icon-gap"></i>Only a Farm Owner can change the farm profile.</p>
                    }

                    @if (canEdit) {
                        @if (restoredAt) {
                            <div class="fpms-alert fpms-alert-info fpms-flex fpms-align-center-items" role="status">
                                <i class="fas fa-history fpms-icon-gap" aria-hidden="true"></i>
                                <span class="fpms-margin-auto-end">Your unsaved changes from {{ restoredAt | farmDateTime }} were restored. Save to keep them.</span>
                                <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary fpms-space-start-2 fpms-nowrap" [disabled]="busy()" (click)="discardDraft()">Discard them</button>
                            </div>
                        } @else if (draftOutdated) {
                            <div class="fpms-alert fpms-alert-warning fpms-flex fpms-align-center-items" role="status">
                                <i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i>
                                <span class="fpms-margin-auto-end">Your unsaved changes were not restored: someone saved the farm profile after you. Make them again if they are still needed.</span>
                                <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary" (click)="draftOutdated = false">Close</button>
                            </div>
                        }
                        <!-- One panel (DEC-109): the profile's parts are sections of it, with Save as its footer. -->
                        <form #f="ngForm" class="fpms-form-stack" (ngSubmit)="save()" (input)="keepDraft()" (change)="keepDraft()" fpmsReview="farm profile" novalidate>
                            <fieldset [disabled]="!canEdit">
                                <div class="fpms-panel">
                                    <div class="fpms-panel-head"><h3 class="fpms-panel-title">Farm details</h3></div>
                                    <div class="fpms-panel-body">
                                        <div class="fpms-field">
                                            <label for="farmId">Farm ID</label>
                                            <input id="farmId" class="fpms-control fpms-code-field" name="farmId" [ngModel]="p.farmId || '—'" readonly aria-describedby="farmIdHelp" />
                                            <small id="farmIdHelp" class="fpms-help fpms-muted">Area, place and farm number, like 0-24-03. It comes from the farm address and is given by the system. Once a lot code uses it, it never changes.</small>
                                        </div>
                                        <div class="fpms-field">
                                            <label for="farmCode">Farm code</label>
                                            <div class="fpms-input-group fpms-code-field-group">
                                                <input id="farmCode" class="fpms-control fpms-code-field" name="farmCode" [ngModel]="p.farmCode" readonly aria-describedby="farmCodeHelp" />
                                                @if (p.canChangeFarmCode) {
                                                    <div class="fpms-input-group-append">
                                                        <button type="button" class="fpms-button fpms-button-secondary" [disabled]="!!p.nextFarmCodeChange" (click)="openCodeDlg()">
                                                            <i class="fas fa-key fpms-icon-gap" aria-hidden="true"></i>Change code
                                                        </button>
                                                    </div>
                                                }
                                            </div>
                                            <small id="farmCodeHelp" class="fpms-help fpms-muted">
                                                Staff enter this with their username to sign in, and it appears on exports and reports.
                                                @if (!p.canChangeFarmCode) {
                                                    Only the Farm Owner can change it.
                                                } @else if (p.nextFarmCodeChange) {
                                                    It was changed recently and can be changed again from {{ p.nextFarmCodeChange | farmDate }}.
                                                } @else {
                                                    Changing it means everyone must use the new code to sign in.
                                                }
                                            </small>
                                        </div>
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-8">
                                                <label for="farmName">Farm name <span class="fpms-danger">*</span></label>
                                                <input id="farmName" class="fpms-control" name="farmName" [(ngModel)]="p.farmName" required maxlength="150" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="area">Total farm area (hectares)</label>
                                                <input id="area" type="number" min="0.01" max="100000" step="0.01" class="fpms-control" name="totalAreaHectares" [(ngModel)]="p.totalAreaHectares" />
                                                <small class="fpms-help fpms-muted">Ponds on record: {{ p.pondAreaHectares | num: 2 }} ha.</small>
                                            </div>
                                        </div>
                                        @if (areaExceeded) {
                                            <div class="fpms-alert fpms-alert-warning fpms-space-y-2 fpms-small" role="status">
                                                <i class="fas fa-exclamation-triangle fpms-icon-gap"></i>The ponds add up to {{ p.pondAreaHectares | num: 2 }} ha, more than the total farm area.
                                                Check the total area or the pond areas. You can still save.
                                            </div>
                                        }
                                    </div>
                                </div>
                                <div class="fpms-panel">
                                    <div class="fpms-panel-head"><h3 class="fpms-panel-title">Address</h3></div>
                                    <div class="fpms-panel-body">
                                        <p class="fpms-small fpms-space-bottom-2" [class.fpms-warning-text]="!p.lotCodeParts" [class.fpms-muted]="p.lotCodeParts">
                                            <i class="fas fa-barcode fpms-icon-gap" aria-hidden="true"></i>Harvest lot codes use this address{{ p.lotCodeParts ? ' (' + p.lotCodeParts + ')' : '' }}: {{ p.lotCodeNote }}
                                        </p>
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-8">
                                                <label for="line1">Street, purok or sitio <span class="fpms-danger">*</span></label>
                                                <input id="line1" class="fpms-control" name="addressLine1" [(ngModel)]="p.addressLine1" required maxlength="200" />
                                                <small class="fpms-help fpms-muted">House number, street, purok or sitio.</small>
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="barangay">Barangay</label>
                                                @if (barangays().length) {
                                                    <select id="barangay" class="fpms-control" name="addressLine2" [(ngModel)]="p.addressLine2" [disabled]="!p.cityMunicipality">
                                                        <option value="">{{ p.cityMunicipality ? 'Choose a barangay' : 'Choose the city or municipality first' }}</option>
                                                        @for (name of barangays(); track name) {
                                                            <option [value]="name">{{ name }}</option>
                                                        }
                                                    </select>
                                                } @else {
                                                    <input id="barangay" class="fpms-control" name="addressLine2" [(ngModel)]="p.addressLine2" maxlength="200" />
                                                    <small class="fpms-help fpms-muted">Type the barangay (no list for this city or municipality).</small>
                                                }
                                            </div>
                                        </div>
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="province">Province <span class="fpms-danger">*</span></label>
                                                <select id="province" class="fpms-control" name="province" [(ngModel)]="p.province" (ngModelChange)="onProvinceChange()" required>
                                                    <option value="" disabled>Choose a province</option>
                                                    @for (name of provinces(); track name) {
                                                        <option [value]="name">{{ name }}</option>
                                                    }
                                                </select>
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="city">City or municipality <span class="fpms-danger">*</span></label>
                                                <select id="city" class="fpms-control" name="cityMunicipality" [(ngModel)]="p.cityMunicipality" (ngModelChange)="onCityChange()" [disabled]="!p.province" required>
                                                    <option value="" disabled>{{ p.province ? 'Choose a city or municipality' : 'Choose the province first' }}</option>
                                                    @for (name of cities(); track name) {
                                                        <option [value]="name">{{ name }}</option>
                                                    }
                                                </select>
                                                <small class="fpms-help fpms-muted">Covered: General Santos City and Sarangani.</small>
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="postal">Postal code</label>
                                                <input id="postal" class="fpms-control" name="postalCode" [(ngModel)]="p.postalCode" maxlength="10" inputmode="numeric" />
                                                @if (!postalOk) {
                                                    <small class="fpms-danger">4 digits, e.g. 9502.</small>
                                                }
                                            </div>
                                        </div>
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="country">Country <span class="fpms-danger">*</span></label>
                                                <input id="country" class="fpms-control" name="country" [(ngModel)]="p.country" required maxlength="100" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="lat">Latitude</label>
                                                <input id="lat" type="number" step="0.000001" min="-90" max="90" class="fpms-control" name="latitude" [(ngModel)]="p.latitude" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="lng">Longitude</label>
                                                <input id="lng" type="number" step="0.000001" min="-180" max="180" class="fpms-control" name="longitude" [(ngModel)]="p.longitude" />
                                            </div>
                                        </div>
                                        @if (p.fullAddress) {
                                            <p class="fpms-small fpms-muted fpms-no-bottom">Printed on reports and sales records as: <span class="fpms-body-text">{{ p.fullAddress }}</span></p>
                                        }
                                    </div>
                                </div>
                                <div class="fpms-panel">
                                    <div class="fpms-panel-head"><h3 class="fpms-panel-title">Contact</h3></div>
                                    <div class="fpms-panel-body">
                                        <div class="fpms-grid-row">
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="cname">Contact person</label>
                                                <input id="cname" class="fpms-control" name="contactName" [(ngModel)]="p.contactName" maxlength="100" />
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="cphone">Phone <span class="fpms-danger">*</span></label>
                                                <input id="cphone" fpmsPhone class="fpms-control" [class.is-invalid]="cph.invalid && cph.touched" name="contactPhone" [(ngModel)]="p.contactPhone" required #cph="ngModel" aria-describedby="cphoneHelp" />
                                                <small id="cphoneHelp" class="fpms-help" [class.fpms-danger]="cph.invalid && cph.touched" [class.fpms-muted]="!(cph.invalid && cph.touched)">{{ cph.invalid && cph.touched ? PHONE_MESSAGE : 'Mobile 0917 123 4567 or landline (083) 552 1234.' }}</small>
                                            </div>
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="cemail">Email</label>
                                                <input id="cemail" type="email" email class="fpms-control" name="contactEmail" [(ngModel)]="p.contactEmail" maxlength="256" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </fieldset>
                            @if (canEdit) {
                                <div class="fpms-form-foot">
                                    <button type="submit" class="fpms-button fpms-button-primary" [disabled]="busy() || !f.form.valid || !postalOk">
                                        @if (busy()) {
                                            <i class="fas fa-spinner fa-spin fpms-icon-gap"></i>
                                        }
                                        Save profile
                                    </button>
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="f.form.markAsPristine(); load()">Cancel</button>
                                    <fpms-form-hint [form]="f"></fpms-form-hint>
                                </div>
                            } @else {
                                <p class="fpms-muted fpms-small"><i class="fas fa-lock fpms-icon-gap"></i>Only a Farm Owner can change the farm profile.</p>
                            }
                        </form>
                    }


                }
            </div>
        </section>
        @if (codeDlg; as d) {
            <div class="fpms-dialog-backdrop">
                <div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="codeDlgTitle">
                    <div class="fpms-dialog-head">
                        <h2 id="codeDlgTitle" class="fpms-margin-auto-end">{{ d.done ? 'Farm code changed' : 'Change farm code' }}</h2>
                        <button type="button" class="fpms-dialog-close" aria-label="Close" (click)="closeCodeDlg()"><span aria-hidden="true">&times;</span></button>
                    </div>
                    @if (d.done) {
                        <div class="fpms-dialog-body">
                            <p class="fpms-space-bottom-2">The new farm code is</p>
                            <p class="h3 fpms-space-bottom-3"><code>{{ d.done.farmCode }}</code></p>
                            <div class="fpms-alert fpms-alert-info fpms-small fpms-no-bottom">
                                <i class="fas fa-info-circle fpms-icon-gap" aria-hidden="true"></i>
                                Tell your staff to sign in with the new code. Anyone who types <code>{{ d.done.oldCode }}</code> is shown the new code instead.
                                People who are signed in now stay signed in.
                            </div>
                        </div>
                        <div class="fpms-dialog-foot">
                            <button type="button" class="fpms-button fpms-button-secondary" (click)="copyCode()"><i class="far fa-copy fpms-icon-gap" aria-hidden="true"></i>Copy code</button>
                            <button type="button" class="fpms-button fpms-button-primary" (click)="closeCodeDlg()">Done</button>
                        </div>
                    } @else {
                        <form (ngSubmit)="saveCode()" fpmsReview="farm code" novalidate autocomplete="off">
                            <div class="fpms-dialog-body">
                                <div class="fpms-alert fpms-alert-warning fpms-small">
                                    <i class="fas fa-exclamation-triangle fpms-icon-gap" aria-hidden="true"></i>
                                    The farm code is what staff type, with their username, to sign in. After the change:
                                    <ul class="fpms-no-bottom pl-3 fpms-space-top-1">
                                        <li>everyone must sign in with the new code, and saved links or bookmarks that use the old one stop working;</li>
                                        <li>exports and reports made earlier keep the old code;</li>
                                        <li>the old code can never be used again, by this farm or any other;</li>
                                        <li>the code can be changed again only after {{ cooldownDays }} days.</li>
                                    </ul>
                                </div>
                                <div class="fpms-field">
                                    <label for="oldCode">Current code</label>
                                    <input id="oldCode" class="fpms-control fpms-code-field" [value]="p.farmCode" readonly />
                                </div>
                                <div class="fpms-field">
                                    <label for="newCode">New code <span class="fpms-danger">*</span></label>
                                    <input id="newCode" class="fpms-control fpms-code-field" name="newCode" [(ngModel)]="d.newCode" (ngModelChange)="codeInput()" maxlength="64" autocomplete="off" spellcheck="false" aria-describedby="newCodeHelp"
                                        [class.is-valid]="d.check?.available && d.checkedFor === d.newCode.trim()" [class.is-invalid]="d.check && !d.check.available && d.checkedFor === d.newCode.trim()" />
                                    <small id="newCodeHelp" class="fpms-help" [class.fpms-muted]="!d.check || d.check.available" [class.fpms-danger]="d.check && !d.check.available" role="status">
                                        @if (d.checking) {
                                            Checking…
                                        } @else if (d.check && d.checkedFor === d.newCode.trim()) {
                                            {{ d.check.available ? 'This code is free.' : d.check.message }}
                                        } @else {
                                            Starts with a letter. 2–64 letters, digits, - or _.
                                        }
                                    </small>
                                </div>
                                <div class="fpms-field fpms-no-bottom">
                                    <label for="confirmCode">Type the new code again <span class="fpms-danger">*</span></label>
                                    <input id="confirmCode" class="fpms-control fpms-code-field" name="confirmCode" [(ngModel)]="d.confirm" maxlength="64" autocomplete="off" spellcheck="false" />
                                    @if (d.confirm && d.confirm.trim() !== d.newCode.trim()) {
                                        <small class="fpms-danger">The two codes do not match.</small>
                                    }
                                </div>
                            </div>
                            <div class="fpms-dialog-foot">
                                <button type="button" class="fpms-button fpms-button-secondary" (click)="closeCodeDlg()">Cancel</button>
                                <button type="submit" class="fpms-button fpms-button-primary" [disabled]="!canSaveCode || busy()">
                                    @if (busy()) { <i class="fas fa-spinner fa-spin fpms-icon-gap"></i> }
                                    Change farm code
                                </button>
                            </div>
                        </form>
                    }
                </div>
            </div>
        }
    `,
})
export class FarmProfileComponent extends FpmsPage implements OnInit, OnDestroy {
    readonly PHONE_MESSAGE = PHONE_MESSAGE;
    p: any = null;
    /** When restored unsaved changes were last kept on this device (DEC-134), else null. */
    restoredAt: string | null = null;
    /** A draft was found but the profile was saved by someone since, so it was not restored. */
    draftOutdated = false;

    // Address dropdowns: General Santos City and Sarangani only (shared/fpms/coverage-area.ts).
    provinces(): string[] {
        return coverageProvinces(this.p?.province);
    }

    cities(): string[] {
        return coverageCities(this.p?.province, this.p?.cityMunicipality);
    }

    barangays(): string[] {
        return coverageBarangays(this.p?.province, this.p?.cityMunicipality, this.p?.addressLine2);
    }

    onProvinceChange(): void {
        applyCoverageProvince(this.p);
        applyCoverageBarangay(this.p);
    }

    onCityChange(): void {
        applyCoverageCity(this.p);
        applyCoverageBarangay(this.p);
    }
    readonly cooldownDays = 30;
    codeDlg: {
        newCode: string;
        confirm: string;
        check: { available: boolean; message: string } | null;
        checkedFor: string;
        checking: boolean;
        done: { oldCode: string; farmCode: string } | null;
    } | null = null;
    private codeTimer: any;

    get canEdit(): boolean {
        return this.can('Farm.Profile.Edit');
    }

    /** The ponds' share of the total farm area, in percent (not capped). */
    get areaShare(): number {
        const total = Number(this.p?.totalAreaHectares);
        return total > 0 ? (Number(this.p.pondAreaHectares) / total) * 100 : 0;
    }

    get areaExceeded(): boolean {
        return !!this.p?.totalAreaHectares && Number(this.p.pondAreaHectares) > Number(this.p.totalAreaHectares);
    }

    /** Philippine postal codes have 4 digits; other countries are not checked here. */
    get postalOk(): boolean {
        const code = this.p?.postalCode?.trim();
        return !code || (this.p?.country ?? '').trim().toLowerCase() !== 'philippines' || /^[0-9]{4}$/.test(code);
    }

    async ngOnInit(): Promise<void> {
        await this.giveFarmId();
        await this.load();
        this.restoreDraft();
    }

    // ------------------------------------------------------------ unsaved changes (DEC-134)

    /**
     * Unsaved changes come back after the sign-in ends or the page reloads, like the harvest and sales forms. They are
     * restored only over the version they were made on; if the profile was saved since, they are dropped and the page says so.
     */
    private restoreDraft(): void {
        const draft = FormDrafts.load<any>(PROFILE_DRAFT);
        this.restoredAt = null;
        this.draftOutdated = false;
        if (!draft?.data?.p || !this.p || !this.canEdit) {
            return;
        }
        if (draft.data.p.rowVersion !== this.p.rowVersion) {
            FormDrafts.clear(PROFILE_DRAFT);
            this.draftOutdated = true;
            return;
        }
        this.p = { ...this.p, ...draft.data.p };
        this.restoredAt = new Date(draft.savedAt).toISOString();
    }

    keepDraft(): void {
        if (this.p && this.canEdit) {
            FormDrafts.save(PROFILE_DRAFT, { p: this.p });
        }
    }

    async discardDraft(): Promise<void> {
        FormDrafts.clear(PROFILE_DRAFT);
        this.restoredAt = null;
        await this.load();
    }

    // ------------------------------------------------------------ farm code (DEC-78)

    get canSaveCode(): boolean {
        const d = this.codeDlg;
        const code = d?.newCode.trim() ?? '';
        return !!d && !d.checking && !!d.check?.available && d.checkedFor === code && d.confirm.trim() === code;
    }

    openCodeDlg(): void {
        this.codeDlg = { newCode: '', confirm: '', check: null, checkedFor: '', checking: false, done: null };
        setTimeout(() => document.getElementById('newCode')?.focus());
    }

    closeCodeDlg(): void {
        clearTimeout(this.codeTimer);
        this.codeDlg = null;
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.codeDlg && !this.busy()) {
            this.closeCodeDlg();
        }
    }

    /** Checks the typed code against the server a moment after typing stops. */
    codeInput(): void {
        const d = this.codeDlg;
        if (!d) {
            return;
        }
        clearTimeout(this.codeTimer);
        d.check = null;
        const code = d.newCode.trim();
        if (!code) {
            d.checking = false;
            return;
        }
        d.checking = true;
        this.codeTimer = setTimeout(async () => {
            let result: any = null;
            try {
                result = await this.api.get<any>('FarmProfile', 'GetFarmCodeAvailability', { code });
            } catch {
                /* the interceptor shows the error */
            }
            if (this.codeDlg === d && d.newCode.trim() === code) {
                d.check = result ? { available: !!result.available, message: result.message } : null;
                d.checkedFor = code;
                d.checking = false;
            }
        }, 400);
    }

    async saveCode(): Promise<void> {
        const d = this.codeDlg;
        if (!d || !this.canSaveCode) {
            return;
        }
        let result: any = null;
        if (await this.act(async () => (result = await this.api.post<any>('FarmProfile', 'ChangeFarmCode', { newCode: d.newCode.trim() })))) {
            d.done = { oldCode: result.oldCode, farmCode: result.farmCode };
            try {
                localStorage.setItem(LAST_FARM_CODE_KEY, result.farmCode);
            } catch {
                /* storage unavailable */
            }
            await this.load();
        }
    }

    async copyCode(): Promise<void> {
        const code = this.codeDlg?.done?.farmCode ?? '';
        try {
            await navigator.clipboard.writeText(code);
            this.notifySaved('Farm code copied.');
        } catch {
            abp.message.info(code, 'Farm code');
        }
    }

    ngOnDestroy(): void {
        clearTimeout(this.codeTimer);
    }

    async load(): Promise<void> {
        this.p = await this.api.get<any>('FarmProfile', 'Get');
        this.p.contactPhone = tidyPhone(this.p.contactPhone);
        // Keep the Farm ID in the top bar and on print headers in step without signing in again.
        if (this.session.tenant && this.p?.farmId) {
            this.session.tenant.farmId = this.p.farmId;
        }
    }

    /** Opening this page as the Farm Owner gives the farm its Farm ID when it has none and the address names a known place. Reading the profile never changes data. */
    private async giveFarmId(): Promise<void> {
        if (!this.can('Farm.Profile.Edit') || this.session.tenant?.farmId) {
            return;
        }

        try {
            await this.api.post<string | null>('FarmProfile', 'GiveFarmId');
        } catch {
            // Not given this time (for example two farms at once); the profile still opens and says so.
        }
    }


    async save(): Promise<void> {
        let warnings: any[] = [];
        if (await this.act(async () => (warnings = (await this.api.put<any[]>('FarmProfile', 'Update', this.p)) ?? []))) {
            FormDrafts.clear(PROFILE_DRAFT);
            this.restoredAt = null;
            this.notifySaved('Farm profile saved.');
            if (warnings.length) {
                this.showWarnings(warnings);
            }
            await this.load();
        }
    }

}
