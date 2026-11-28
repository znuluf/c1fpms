import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';
import { ClientListFilter } from '@shared/fpms/client-list';
import { FormDrafts } from '@shared/fpms/drafts';

/** One account form open at a time, so one draft (DEC-134). Never holds a password. */
const USER_DRAFT = 'farm-user';

const ROLES = [
    { value: 'FarmOwner', label: 'Farm Owner' },
    { value: 'FarmTechnician', label: 'Farm Technician' },
];

/** Technician Account Management (Ref 1.3, AC-02). Accounts are deactivated, never deleted. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Farm users" subtitle="Farm Owner and Farm Technician accounts of this farm.">
            <button class="fpms-button fpms-button-primary" (click)="startCreate()" [disabled]="!!form"><i class="fas fa-user-plus fpms-icon-gap"></i>Add user</button>
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (form) {
                    <div class="fpms-dialog-backdrop"><div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div class="fpms-dialog-body fpms-space-0">
                        <div class="fpms-panel fpms-panel-outline fpms-panel-primary">
                            <div class="fpms-panel-head"><h3 id="account-dialog-title" class="fpms-panel-title">{{ form.id ? 'Edit account' : 'New account' }}</h3></div>
                            <form #f="ngForm" (ngSubmit)="save()" (input)="keepDraft()" (change)="keepDraft()" fpmsReview="account" [fpmsReviewNew]="!form.id" novalidate autocomplete="off">
                                <div class="fpms-panel-body">
                                    @if (restoredAt) {
                                        <div class="fpms-alert fpms-alert-info fpms-flex align-items-center" role="status">
                                            <i class="fas fa-history fpms-icon-gap" aria-hidden="true"></i>
                                            <span class="fpms-margin-auto-end">Your unsaved account from {{ restoredAt | farmDateTime }} was restored.{{ form.id ? '' : ' The temporary password is a new one.' }}</span>
                                            <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary fpms-space-start-2 fpms-nowrap" (click)="discardDraft()">Discard it</button>
                                        </div>
                                    }
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="name">First name <span class="fpms-danger">*</span></label>
                                            <input id="name" class="fpms-control" name="name" [(ngModel)]="form.name" (blur)="suggestUserName()" required maxlength="64" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="surname">Surname <span class="fpms-danger">*</span></label>
                                            <input id="surname" class="fpms-control" name="surname" [(ngModel)]="form.surname" (blur)="suggestUserName()" required maxlength="64" />
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="role">Role <span class="fpms-danger">*</span></label>
                                            <select id="role" class="fpms-control" name="roleName" [(ngModel)]="form.roleName" required>
                                                @for (r of roles; track r.value) {
                                                    <option [value]="r.value">{{ r.label }}</option>
                                                }
                                            </select>
                                        </div>
                                    </div>
                                    <div class="fpms-grid-row">
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="userName">Username <span class="fpms-danger">*</span></label>
                                            <input id="userName" class="fpms-control" name="userName" [(ngModel)]="form.userName" (ngModelChange)="userNameEdited = !!$event" required maxlength="256" autocapitalize="off" [disabled]="!!form.id" />
                                            @if (!form.id) {
                                                <small class="fpms-help fpms-muted">Filled in from the name; you can change it. Fixed once saved.</small>
                                            }
                                        </div>
                                        <div class="fpms-field fpms-col-md-4">
                                            <label for="email">Email <span class="fpms-danger">*</span></label>
                                            <input id="email" type="email" email class="fpms-control" name="emailAddress" [(ngModel)]="form.emailAddress" required maxlength="256" />
                                        </div>
                                        @if (!form.id) {
                                            <div class="fpms-field fpms-col-md-4">
                                                <label for="pw">Temporary password <span class="fpms-danger">*</span></label>
                                                <div class="input-group">
                                                    <input id="pw" class="fpms-control" name="temporaryPassword" [(ngModel)]="form.temporaryPassword" required minlength="8" autocomplete="new-password" />
                                                    <div class="input-group-append">
                                                        <button type="button" class="fpms-button fpms-button-secondary" (click)="form.temporaryPassword = generate()" title="Generate">
                                                            <i class="fas fa-dice"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                <small class="fpms-help fpms-muted">Give it to the person; they must change it at first sign-in.</small>
                                            </div>
                                        }
                                    </div>
                                </div>
                                <div class="fpms-panel-foot">
                                    <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !f.form.valid">Save</button>
                                    <button type="button" class="fpms-button fpms-button-secondary" (click)="cancel()">Cancel</button>
                                    <fpms-form-hint [form]="f"></fpms-form-hint>
                                </div>
                            </form>
                        </div>
                    </div></div></div>
                }

                @if (reset) {
                    <div class="fpms-dialog-backdrop">
                        <div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
                            <div class="fpms-dialog-body fpms-space-0">
                                <div class="fpms-panel fpms-panel-outline fpms-panel-warning">
                                    <div class="fpms-panel-head">
                                        <h3 id="reset-password-title" class="fpms-panel-title">
                                            Reset password for {{ reset.user.name }} {{ reset.user.surname }}
                                        </h3>
                                    </div>
                                    <div class="fpms-panel-body">
                                        <div class="fpms-grid-row align-items-end">
                                            <div class="fpms-field fpms-col-md-8">
                                                <label for="rpw">New temporary password</label>
                                                <div class="input-group">
                                                    <input id="rpw" class="fpms-control" name="rpw" [(ngModel)]="reset.password" minlength="8" autocomplete="new-password" />
                                                    <div class="input-group-append">
                                                        <button type="button" class="fpms-button fpms-button-secondary" (click)="reset.password = generate()" aria-label="Generate a password" title="Generate a password">
                                                            <i class="fas fa-dice" aria-hidden="true"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <p class="fpms-small fpms-muted fpms-no-bottom">The account is unlocked and must set a new password at next sign-in.</p>
                                    </div>
                                    <div class="fpms-panel-foot">
                                        <button type="button" class="fpms-button fpms-button-warning fpms-icon-gap" [disabled]="busy() || (reset.password?.length ?? 0) < 8" (click)="doReset()">Reset password</button>
                                        <button type="button" class="fpms-button fpms-button-secondary" (click)="reset = null">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                }

                <!-- Filters on the page ground, the list in one panel (DEC-115). -->
                <div class="fpms-list-filters">
                        <fpms-list-toolbar
                            placeholder="Search by name, username or email"
                            [search]="f.search()"
                            [resultText]="f.resultText()"
                            [chips]="f.chips()"
                            [chip]="f.chip()"
                            (searchChange)="f.search.set($event)"
                            (chipChange)="f.chip.set($event)"></fpms-list-toolbar>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!users()) {
                            <fpms-loading></fpms-loading>
                        } @else if (f.noMatch()) {
                            <fpms-empty text="No accounts match. Clear the search or the filter." icon="fas fa-users"></fpms-empty>
                        } @else {
                            <table class="fpms-data-table fpms-table-hover fpms-no-bottom">
                                <thead>
                                    <!-- Four columns: the person with their sign-in and email, role, status, actions (DEC-115). -->
                                    <tr><th>Person</th><th>Role</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr>
                                </thead>
                                <tbody>
                                    @for (u of f.visible(); track u.id) {
                                        <tr [class.fpms-muted]="!u.isActive">
                                            <td>
                                                <strong>{{ u.name }} {{ u.surname }}</strong>@if (u.isCurrentUser) { <span class="fpms-label badge-light fpms-icon-gap">you</span> }
                                                <div class="fpms-muted">{{ u.userName }}{{ u.emailAddress ? ' · ' + u.emailAddress : ' · no email' }}</div>
                                            </td>
                                            <td>{{ roleLabel(u.roleName) }}</td>
                                            <td class="fpms-badge-stack">
                                                <fpms-badge [text]="u.isActive ? 'Active' : 'Deactivated'" [tone]="u.isActive ? 'success' : 'secondary'"></fpms-badge>
                                                @if (u.isLockedOut) { <fpms-badge text="Locked out" tone="danger"></fpms-badge> }
                                                @if (u.mustChangePassword) { <fpms-badge text="Must change password" tone="warning"></fpms-badge> }
                                            </td>
                                            <td class="fpms-align-end">
                                                <div class="fpms-actions-stack">
                                                    <button class="fpms-button fpms-button-compact fpms-button-outline" (click)="startEdit(u)" [attr.aria-label]="'Edit ' + u.name + ' ' + u.surname">Edit</button>
                                                    @if (!u.isCurrentUser) {
                                                        <button class="fpms-button fpms-button-compact fpms-button-secondary" (click)="reset = { user: u, password: generate() }">Reset password</button>
                                                        <button class="fpms-button fpms-button-compact" [class.fpms-button-danger]="u.isActive" [class.fpms-button-success]="!u.isActive" [disabled]="busy()" (click)="toggle(u)">
                                                            {{ u.isActive ? 'Deactivate' : 'Reactivate' }}
                                                        </button>
                                                    }
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
export class FarmUsersComponent extends FpmsPage implements OnInit {
    readonly roles = ROLES;
    users = signal<any[] | null>(null);
    f = new ClientListFilter<any>(
        () => this.users(),
        (u) => [u.name, u.surname, u.userName, u.emailAddress],
        (u) => (u.isActive ? 'active' : 'deactivated'),
        [{ value: 'active', label: 'Active' }, { value: 'deactivated', label: 'Deactivated' }],
        'All accounts',
        ['account', 'accounts']
    );
    form: any = null;
    /** When a restored unsaved account was last kept on this device (DEC-134), else null. */
    restoredAt: string | null = null;
    reset: { user: any; password: string } | null = null;

    /** Set once the Owner types a username; the suggestion then stops replacing it (DEC-75). */
    userNameEdited = false;

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.users.set(await this.api.get<any[]>('FarmUser', 'GetAll'));
        if (!this.form) {
            this.reopenDraft();
        }
    }

    // ------------------------------------------------------------ unsaved account (DEC-134)

    /**
     * An account form left unsaved (the sign-in ended, the page reloaded) opens again with what was typed. An edit is
     * restored only if the account has not changed since; a new account gets a new temporary password.
     */
    private reopenDraft(): void {
        const draft = FormDrafts.load<any>(USER_DRAFT);
        const d = draft?.data;
        if (!d?.form) {
            return;
        }
        if (d.form.id) {
            const u = (this.users() ?? []).find((x) => x.id === d.form.id);
            if (!u || JSON.stringify(this.editable(u)) !== JSON.stringify(d.base)) {
                FormDrafts.clear(USER_DRAFT);
                return;
            }
            this.startEdit(u);
        } else {
            this.startCreate();
        }
        Object.assign(this.form, d.form, this.form.id ? {} : { temporaryPassword: this.form.temporaryPassword });
        this.userNameEdited = !!d.userNameEdited;
        this.restoredAt = new Date(draft!.savedAt).toISOString();
        void this.suggestUserName();
    }

    private editable(u: any): any {
        return { name: u.name, surname: u.surname, emailAddress: u.emailAddress, roleName: u.roleName };
    }

    keepDraft(): void {
        const f = this.form;
        if (!f) {
            return;
        }
        const { temporaryPassword, ...typed } = f;
        const u = f.id ? (this.users() ?? []).find((x) => x.id === f.id) : null;
        FormDrafts.save(USER_DRAFT, { form: typed, base: u ? this.editable(u) : null, userNameEdited: this.userNameEdited });
    }

    discardDraft(): void {
        FormDrafts.clear(USER_DRAFT);
        this.restoredAt = null;
        this.form = null;
    }

    cancel(): void {
        FormDrafts.clear(USER_DRAFT);
        this.restoredAt = null;
        this.form = null;
    }

    roleLabel(name: string): string {
        return ROLES.find((r) => r.value === name)?.label ?? name ?? '—';
    }

    startCreate(): void {
        this.reset = null;
        this.restoredAt = null;
        this.userNameEdited = false;
        this.form = { name: '', surname: '', userName: '', emailAddress: '', roleName: 'FarmTechnician', temporaryPassword: this.generate() };
    }

    /** New accounts only: first initial and surname, numbered when taken in this farm. */
    async suggestUserName(): Promise<void> {
        const f = this.form;
        if (!f || f.id || this.userNameEdited || (!f.name?.trim() && !f.surname?.trim())) {
            return;
        }
        const r = await this.api
            .get<{ userName?: string }>('FarmUser', 'GetSuggestedUserName', { name: (f.name ?? '').trim(), surname: (f.surname ?? '').trim() })
            .catch(() => null); // a suggestion is a convenience; the Owner can always type the username
        if (r?.userName && this.form === f && !this.userNameEdited) {
            f.userName = r.userName;
        }
    }

    startEdit(u: any): void {
        this.reset = null;
        this.restoredAt = null;
        this.form = { id: u.id, name: u.name, surname: u.surname, userName: u.userName, emailAddress: u.emailAddress, roleName: u.roleName };
    }

    async save(): Promise<void> {
        const f = this.form;
        const ok = await this.act(() =>
            f.id
                ? this.api.put('FarmUser', 'Update', { id: f.id, name: f.name, surname: f.surname, emailAddress: f.emailAddress, roleName: f.roleName })
                : this.api.post('FarmUser', 'Create', f)
        );
        if (ok) {
            FormDrafts.clear(USER_DRAFT);
            this.restoredAt = null;
            if (!f.id) {
                abp.message.info(`Account "${f.userName}" created. Temporary password: ${f.temporaryPassword}`, 'Account created');
            } else {
                this.notifySaved();
            }
            this.form = null;
            this.load();
        }
    }

    async doReset(): Promise<void> {
        const r = this.reset;
        if (await this.act(() => this.api.post('FarmUser', 'ResetPassword', { id: r.user.id, temporaryPassword: r.password }))) {
            abp.message.info(`Temporary password for "${r.user.userName}": ${r.password}`, 'Password reset');
            this.reset = null;
            this.load();
        }
    }

    async toggle(u: any): Promise<void> {
        const action = u.isActive ? 'Deactivate' : 'Reactivate';
        const message = u.isActive
            ? `${u.name} ${u.surname} will no longer be able to sign in. Their records are kept.`
            : `${u.name} ${u.surname} will be able to sign in again.`;
        if (!(await this.confirm(message, `${action} account?`, { confirmText: `${action} account`, danger: u.isActive }))) {
            return;
        }
        if (await this.act(() => this.api.post('FarmUser', 'SetActive', { id: u.id, isActive: !u.isActive }))) {
            this.notifySaved(`${u.name} ${u.surname}: account ${u.isActive ? 'deactivated' : 'reactivated'}.`);
            this.load();
        }
    }

    /** Readable temporary password that satisfies the default policy (upper, lower, digit, 8+). */
    generate(): string {
        const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lower = 'abcdefghijkmnpqrstuvwxyz';
        const digits = '23456789';
        const all = upper + lower + digits;
        const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
        const chars = [pick(upper), pick(lower), pick(digits)];
        while (chars.length < 10) {
            chars.push(pick(all));
        }
        return chars.sort(() => Math.random() - 0.5).join('');
    }
}
