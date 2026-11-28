import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';
import { unbroken } from '@shared/fpms/labels';

/** System Administration: farm accounts and the registration switch (D-16). No farm records are shown. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Farms" subtitle="Registered farms and their accounts. System Administration."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <div class="fpms-panel">
                    <div class="fpms-panel-head"><h3 class="fpms-panel-title">Farm registration</h3></div>
                    <div class="fpms-panel-body fpms-flex align-items-center flex-wrap">
                        @if (registration() !== null) {
                            <span class="fpms-space-end-3">
                                Registration is <fpms-badge [text]="registration() ? 'Open' : 'Closed'" [tone]="registration() ? 'success' : 'secondary'"></fpms-badge>
                            </span>
                            <button class="fpms-button fpms-button-compact" [class.fpms-button-danger]="registration()" [class.fpms-button-success]="!registration()" [disabled]="busy()" (click)="toggleRegistration()">
                                {{ registration() ? 'Close registration' : 'Open registration' }}
                            </button>
                            <span class="fpms-muted fpms-space-start-3">Open it only while onboarding a farm; the sign-in page shows the link when open.</span>
                        }
                    </div>
                </div>
                @if (fix(); as f) {
                    <div class="fpms-dialog-backdrop">
                        <div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="farm-id-correction-title" aria-describedby="farm-id-correction-help">
                            <div class="fpms-dialog-body fpms-space-0">
                                <div class="fpms-panel fpms-panel-outline fpms-panel-warning">
                                    <div class="fpms-panel-head">
                                        <h3 id="farm-id-correction-title" class="fpms-panel-title">Correct the Farm ID of {{ f.name }}</h3>
                                    </div>
                                    <form (ngSubmit)="saveFix()" #ff="ngForm" novalidate>
                                        <div class="fpms-panel-body">
                                            <p id="farm-id-correction-help" class="fpms-small fpms-muted">
                                                Use this only for an ID given in error. The ID is printed on lot codes and receipts, so a farm keeps its ID once it is in use. The reason is kept in the log.
                                            </p>
                                            <div class="fpms-grid-row">
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="fx-a">Area (0 General Santos, 1 Sarangani)</label>
                                                    <input id="fx-a" type="number" min="0" max="9" class="fpms-control" name="area" [(ngModel)]="f.area" required />
                                                </div>
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="fx-p">Place (01 to 26)</label>
                                                    <input id="fx-p" type="number" min="1" max="99" class="fpms-control" name="place" [(ngModel)]="f.place" required />
                                                </div>
                                                <div class="fpms-field fpms-col-md-4">
                                                    <label for="fx-n">Farm number (01 to 99)</label>
                                                    <input id="fx-n" type="number" min="1" max="99" class="fpms-control" name="farmNumber" [(ngModel)]="f.farmNumber" required />
                                                </div>
                                            </div>
                                            <div class="fpms-field fpms-no-bottom">
                                                <label for="fx-r">Reason</label>
                                                <input id="fx-r" class="fpms-control" name="reason" [(ngModel)]="f.reason" required maxlength="300" />
                                            </div>
                                        </div>
                                        <div class="fpms-panel-foot">
                                            <button type="submit" class="fpms-button fpms-button-primary" [disabled]="busy() || !ff.form.valid">Save Farm ID</button>
                                            <button type="button" class="fpms-button fpms-button-secondary fpms-icon-gap" (click)="fix.set(null)">Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                }
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!farms()) {
                            <fpms-loading></fpms-loading>
                        } @else {
                            <!-- Six columns (DEC-122): the farm as its code tag and name; actions stack. -->
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead><tr><th>Farm</th><th>Farm ID</th><th>Registered</th><th class="fpms-align-end">Accounts</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    @for (x of farms(); track x.tenantId) {
                                        <tr [class.fpms-muted]="!x.isActive">
                                            <td><span class="fpms-pond-tag">{{ unbroken(x.farmCode) }}</span><div class="fpms-space-top-1">{{ x.name }}</div></td>
                                            <td class="fpms-nowrap">@if (x.farmId) { <code>{{ x.farmId }}</code> } @else { <span class="fpms-muted">Not given yet</span> }</td>
                                            <td class="fpms-nowrap">{{ x.creationTime | farmDate }}</td>
                                            <td class="fpms-align-end">{{ x.userCount }}</td>
                                            <td><fpms-badge [text]="x.isActive ? 'Active' : 'Inactive'" [tone]="x.isActive ? 'success' : 'secondary'"></fpms-badge></td>
                                            <td class="fpms-align-end">
                                                <div class="fpms-actions-stack">
                                                    <a class="fpms-button fpms-button-compact fpms-button-outline" routerLink="/app/system/recovery" [queryParams]="{ tenantId: x.tenantId }" [attr.aria-label]="'Account recovery for ' + x.name">Account recovery</a>
                                                    <button class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy()" (click)="startFix(x)">Correct Farm ID</button>
                                                    <button class="fpms-button fpms-button-compact" [class.fpms-button-danger]="x.isActive" [class.fpms-button-success]="!x.isActive" [disabled]="busy()" (click)="toggleFarm(x)">
                                                        {{ x.isActive ? 'Deactivate' : 'Activate' }}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="6" class="fpms-align-center fpms-muted fpms-space-y-3">No farms registered.</td></tr>
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
export class SystemFarmsComponent extends FpmsPage implements OnInit {
    readonly unbroken = unbroken;
    farms = signal<any[] | null>(null);
    registration = signal<boolean | null>(null);
    fix = signal<any | null>(null);

    startFix(x: any): void {
        const [area, place, farmNumber] = x.farmId ? x.farmId.split('-').map(Number) : [0, null, null];
        this.fix.set({ tenantId: x.tenantId, name: x.name, area, place, farmNumber, reason: '' });
    }

    async saveFix(): Promise<void> {
        const f = this.fix();
        if (f && (await this.act(() => this.api.post('SystemFarm', 'SetFarmId', { tenantId: f.tenantId, area: Number(f.area), place: Number(f.place), farmNumber: Number(f.farmNumber), reason: f.reason })))) {
            this.notifySaved('Farm ID saved.');
            this.fix.set(null);
            this.load();
        }
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        const [farms, reg] = await Promise.all([
            this.api.get<any[]>('SystemFarm', 'GetFarms'),
            this.api.get<any>('SystemFarm', 'GetRegistrationSetting'),
        ]);
        this.farms.set(farms);
        this.registration.set(!!reg?.isEnabled);
    }

    /** Opening registration lets anyone with the sign-in page register a farm, so it asks first (DEC-122). */
    async toggleRegistration(): Promise<void> {
        const opening = !this.registration();
        const ok = await this.confirm(
            opening ? 'The sign-in page will show "Register a farm" to anyone who opens it. Close it again when the farm is registered.' : 'The sign-in page will no longer offer registration. Registered farms are not affected.',
            opening ? 'Open farm registration?' : 'Close farm registration?',
            { confirmText: opening ? 'Open registration' : 'Close registration', danger: opening }
        );
        if (!ok) {
            return;
        }
        if (await this.act(() => this.api.post('SystemFarm', 'SetRegistrationSetting', { isEnabled: opening }))) {
            this.notifySaved(opening ? 'Farm registration opened.' : 'Farm registration closed.');
            this.load();
        }
    }

    async toggleFarm(x: any): Promise<void> {
        const message = x.isActive ? `Users of ${x.name} will not be able to sign in until the farm is activated again. No data is deleted.` : `Users of ${x.name} can sign in again.`;
        if (!(await this.confirm(message, `${x.isActive ? 'Deactivate' : 'Activate'} ${x.name}?`, { confirmText: x.isActive ? 'Deactivate farm' : 'Activate farm', danger: x.isActive }))) {
            return;
        }
        if (await this.act(() => this.api.post('SystemFarm', 'SetFarmActive', { tenantId: x.tenantId, isActive: !x.isActive }))) {
            this.notifySaved(`${x.name} ${x.isActive ? 'deactivated' : 'activated'}.`);
            this.load();
        }
    }
}
