import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';

/** Account recovery (US-16, AC-22, D-24): verify identity, then unlock or issue a temporary password. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header [narrow]="true" title="Account recovery" subtitle="Unlock an account or issue a temporary password. System Administration."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner fpms-narrow">
                <div class="fpms-alert fpms-alert-info">
                    <i class="fas fa-user-shield fpms-icon-gap"></i>Before acting, verify the person's identity through a second Farm Owner of the same farm or the pre-agreed security question.
                    Every action is recorded in the security log.
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body">
                        <div class="fpms-field">
                            <label for="farm">Farm</label>
                            <select id="farm" class="fpms-control" [(ngModel)]="tenantId" (ngModelChange)="loadUsers()">
                                <option [ngValue]="null">Choose a farm</option>
                                @for (x of farms; track x.tenantId) {
                                    <option [ngValue]="x.tenantId">{{ x.farmCode }} · {{ x.name }}</option>
                                }
                            </select>
                        </div>
                        @if (users) {
                            <div class="fpms-table-scroll">
                            <!-- Three columns (DEC-122): the person (pick one), role, status. -->
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead><tr><th>Person</th><th>Role</th><th>Status</th></tr></thead>
                                <tbody>
                                    @for (u of users; track u.userId) {
                                        <tr [class.fpms-row-selected]="selected?.userId === u.userId" (click)="select(u)" style="cursor: pointer">
                                            <td>
                                                <div class="fpms-check fpms-check-radio">
                                                    <input type="radio" class="fpms-check-input" name="user" [id]="'u' + u.userId" [checked]="selected?.userId === u.userId" (change)="select(u)" />
                                                    <label class="fpms-check-label" [for]="'u' + u.userId"><strong>{{ u.fullName }}</strong></label>
                                                </div>
                                                <div class="fpms-muted fpms-padding-start-4">{{ u.userName }}</div>
                                            </td>
                                            <td>{{ u.roleName }}</td>
                                            <td class="fpms-badge-stack">
                                                @if (!u.isActive) { <fpms-badge text="Deactivated" tone="secondary"></fpms-badge> }
                                                @if (u.isLockedOut) { <fpms-badge text="Locked out" tone="danger"></fpms-badge> }
                                                @if (u.mustChangePassword) { <fpms-badge text="Must change password" tone="warning"></fpms-badge> }
                                                @if (u.isActive && !u.isLockedOut && !u.mustChangePassword) { <fpms-badge text="Active" tone="success"></fpms-badge> }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                            </div>
                        }
                    </div>
                </div>

                @if (selected) {
                    <div class="fpms-panel fpms-panel-outline fpms-panel-warning">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Recover {{ selected.userName }}</h3></div>
                        <div class="fpms-panel-body">
                            <div class="fpms-field">
                                <label for="vm">Identity verified through</label>
                                <select id="vm" class="fpms-control" [(ngModel)]="method">
                                    @for (o of Options.verification; track o.value) {
                                        <option [ngValue]="o.value">{{ o.label }}</option>
                                    }
                                </select>
                            </div>
                            <div class="fpms-field">
                                <label for="note">Note</label>
                                <input id="note" class="fpms-control" [(ngModel)]="note" maxlength="300" placeholder="e.g. confirmed by second owner J. Cruz by phone" />
                            </div>
                            <div class="fpms-check fpms-check-box">
                                <input type="checkbox" class="fpms-check-input" id="ver" [(ngModel)]="verified" />
                                <label class="fpms-check-label" for="ver">I verified this person's identity.</label>
                            </div>
                        </div>
                        <div class="fpms-panel-foot">
                            <button class="fpms-button fpms-button-outline fpms-icon-gap" [disabled]="busy() || !verified" (click)="unlock()">Unlock account</button>
                            <button class="fpms-button fpms-button-warning" [disabled]="busy() || !verified" (click)="issue()">Issue temporary password</button>
                        </div>
                    </div>
                }

                @if (temp) {
                    <div class="fpms-panel fpms-panel-outline fpms-panel-success">
                        <div class="fpms-panel-body">
                            <p class="fpms-space-bottom-1">Temporary password for <strong>{{ temp.userName }}</strong> (shown once):</p>
                            <p class="h3 fpms-weight-bold fpms-space-bottom-2"><code>{{ temp.temporaryPassword }}</code></p>
                            <p class="fpms-muted fpms-no-bottom">Give it to the person directly. They must choose a new password at their next sign-in.</p>
                        </div>
                        <div class="fpms-panel-foot"><button class="fpms-button fpms-button-secondary fpms-button-compact" (click)="temp = null">Done</button></div>
                    </div>
                }
            </div>
        </section>
    `,
})
export class RecoveryComponent extends FpmsPage implements OnInit {
    farms: any[] = [];
    users: any[] | null = null;
    tenantId: number | null = null;
    selected: any = null;
    method = 1;
    note = '';
    verified = false;
    temp: any = null;

    async ngOnInit(): Promise<void> {
        this.farms = await this.api.get<any[]>('SystemFarm', 'GetFarms');
        const id = Number(this.query('tenantId'));
        if (id) {
            this.tenantId = id;
            this.loadUsers();
        }
    }

    async loadUsers(): Promise<void> {
        this.selected = null;
        this.temp = null;
        this.users = this.tenantId ? await this.api.get<any[]>('AccountRecovery', 'GetFarmUsers', { tenantId: this.tenantId }) : null;
    }

    select(u: any): void {
        this.selected = u;
        this.verified = false;
        this.note = '';
        this.temp = null;
    }

    private input(): any {
        return { tenantId: this.tenantId, userId: this.selected.userId, identityVerified: this.verified, verificationMethod: this.method, note: this.note };
    }

    /** What the review shows before an account action (DEC-122): who, which farm, and how identity was checked. */
    private reviewRows(): { label: string; after: string }[] {
        const farm = this.farms.find((x: any) => x.tenantId === this.tenantId);
        return [
            { label: 'Account', after: `${this.selected.fullName} (${this.selected.userName})` },
            { label: 'Farm', after: farm ? `${farm.farmCode} · ${farm.name}` : '' },
            { label: 'Identity verified through', after: (this.L.VerificationMethods as Record<number, string>)[this.method] ?? '—' },
            { label: 'Note', after: this.note?.trim() || '—' },
        ];
    }

    async unlock(): Promise<void> {
        const ok = await this.confirm('The account can sign in again with its own password. This is recorded in the security log.', `Unlock ${this.selected.userName}?`, {
            confirmText: 'Unlock account',
            rows: this.reviewRows(),
        });
        if (!ok) {
            return;
        }
        if (await this.act(() => this.api.post('AccountRecovery', 'Unlock', this.input()))) {
            this.notifySaved('Account unlocked.');
            this.loadUsers();
        }
    }

    async issue(): Promise<void> {
        const ok = await this.confirm(
            'Their current password stops working. The temporary password is shown once; they choose a new one at their next sign-in. This is recorded in the security log.',
            `Issue a temporary password for ${this.selected.userName}?`,
            { confirmText: 'Issue temporary password', danger: true, rows: this.reviewRows() }
        );
        if (!ok) {
            return;
        }
        let result: any;
        if (await this.act(async () => (result = await this.api.post<any>('AccountRecovery', 'IssueTemporaryPassword', this.input())))) {
            await this.loadUsers();
            this.temp = result;
        }
    }
}
