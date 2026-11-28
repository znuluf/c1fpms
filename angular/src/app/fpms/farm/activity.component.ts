import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { PagerState } from '@shared/fpms/pager';
import { FPMS_IMPORTS } from '../shared-imports';

/** Farm activity log for Owners (Ref 9.1): user actions and data changes in this farm only. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Activity log" subtitle="Who did what in this farm."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <!-- Filters on the page ground; each date box wide enough for its whole date (DEC-115). -->
                <div class="fpms-list-filters">
                        <div class="fpms-grid-row align-items-end">
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="from">From</label>
                                <input id="from" type="date" class="fpms-control" [(ngModel)]="f.from" />
                            </div>
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="to">To</label>
                                <input id="to" type="date" class="fpms-control" [(ngModel)]="f.to" />
                            </div>
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="user">User</label>
                                <select id="user" class="fpms-control" [(ngModel)]="f.userId">
                                    <option [ngValue]="null">All users</option>
                                    @for (u of users(); track u.id) {
                                        <option [ngValue]="u.id">{{ u.name }} {{ u.surname }}</option>
                                    }
                                </select>
                            </div>
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="rt">Record type</label>
                                <select id="rt" class="fpms-control" [(ngModel)]="f.recordType">
                                    <option [ngValue]="null">All record types</option>
                                    @for (t of recordTypes(); track t) {
                                        <option [ngValue]="t">{{ t }}</option>
                                    }
                                </select>
                            </div>
                            <div class="fpms-field fpms-col-auto">
                                <button class="fpms-button fpms-button-primary" (click)="apply()" [disabled]="busy()">Apply</button>
                            </div>
                        </div>
                </div>
                <div class="fpms-tabs" role="tablist" aria-label="Activity type">
                    <button type="button" role="tab" class="fpms-tab" [class.active]="tab === 'changes'" [attr.aria-selected]="tab === 'changes'" (click)="tab = 'changes'">Data changes</button>
                    <button type="button" role="tab" class="fpms-tab" [class.active]="tab === 'actions'" [attr.aria-selected]="tab === 'actions'" (click)="tab = 'actions'">User actions</button>
                </div>
                <div class="fpms-panel card-tabs-body">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!changes() || !actions()) {
                            <fpms-loading></fpms-loading>
                        } @else if (tab === 'changes') {
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th>Time</th><th>User</th><th>Record</th><th>Change</th><th>Values</th></tr></thead>
                                <tbody>
                                    @for (c of changes(); track $index) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ c.changeTime | farmDateTime }}</td>
                                            <td>{{ c.userName }}</td>
                                            <td>{{ c.recordType }}</td>
                                            <td>{{ c.changeType }}</td>
                                            <td class="fpms-small fpms-muted">{{ c.changes.join('; ') }}</td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="5" class="fpms-align-center fpms-muted fpms-space-y-3">No data changes in this range.</td></tr>
                                    }
                                </tbody>
                            </table>
                        } @else {
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th>Time</th><th>User</th><th>Area</th><th>Action</th><th>Result</th></tr></thead>
                                <tbody>
                                    @for (a of actions(); track $index) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ a.executionTime | farmDateTime }}</td>
                                            <td>{{ a.userName }}</td>
                                            <td>{{ a.area }}</td>
                                            <td>{{ a.action }}</td>
                                            <td><fpms-badge [text]="a.failed ? 'Failed' : 'OK'" [tone]="a.failed ? 'danger' : 'success'"></fpms-badge></td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="5" class="fpms-align-center fpms-muted fpms-space-y-3">No user actions in this range.</td></tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                    @if (tab === 'changes') {
                        <fpms-pager [state]="changePager" (changed)="loadChanges()"></fpms-pager>
                    } @else {
                        <fpms-pager [state]="actionPager" (changed)="loadActions()"></fpms-pager>
                    }
                </div>
            </div>
        </section>
    `,
})
export class ActivityComponent extends FpmsPage implements OnInit {
    changes = signal<any[] | null>(null);
    actions = signal<any[] | null>(null);
    recordTypes = signal<string[]>([]);
    changePager = new PagerState();
    actionPager = new PagerState();
    users = signal<any[]>([]);
    tab: 'changes' | 'actions' = 'changes';
    f: any = { from: FarmTime.addDays(FarmTime.today(), -7), to: FarmTime.today(), userId: null, recordType: null };

    ngOnInit(): void {
        this.api.get<any[]>('FarmUser', 'GetAll').then((u) => this.users.set(u ?? []));
        this.api.get<string[]>('ActivityLog', 'GetRecordTypes').then((t) => this.recordTypes.set(t ?? []));
        this.load();
    }

    apply(): void {
        this.changePager.reset();
        this.actionPager.reset();
        this.load();
    }

    async load(): Promise<void> {
        await Promise.all([this.loadChanges(), this.loadActions()]);
    }

    async loadChanges(): Promise<void> {
        await this.run(async () => {
            const r = await this.api.get<any>('ActivityLog', 'GetDataChanges', { ...this.f, ...this.changePager.params });
            this.changes.set(r.items);
            if (this.changePager.update(r.totalCount)) {
                await this.loadChanges();
            }
        });
    }

    async loadActions(): Promise<void> {
        await this.run(async () => {
            const r = await this.api.get<any>('ActivityLog', 'GetActions', { ...this.f, ...this.actionPager.params });
            this.actions.set(r.items);
            if (this.actionPager.update(r.totalCount)) {
                await this.loadActions();
            }
        });
    }
}
