import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { PagerState } from '@shared/fpms/pager';
import { FPMS_IMPORTS } from '../shared-imports';

/** Security and error logs without farm record contents (Ref 9.1, D-16). */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Security and error logs" subtitle="Sign-in attempts and the errors the system recorded. No farm records are shown. System Administration."></fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                <!-- Filters on the page ground (DEC-122). -->
                <div class="fpms-list-filters">
                        <div class="fpms-grid-row align-items-end">
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="from">From</label>
                                <input id="from" type="date" class="fpms-control" [(ngModel)]="from" />
                            </div>
                            <div class="fpms-field fpms-col-6 fpms-col-md-3">
                                <label for="to">To</label>
                                <input id="to" type="date" class="fpms-control" [(ngModel)]="to" />
                            </div>
                            <div class="fpms-field fpms-col-md-3">
                                <label for="farm">Farm</label>
                                <select id="farm" class="fpms-control" [(ngModel)]="tenantId">
                                    <option [ngValue]="null">All, with system</option>
                                    @for (x of farms(); track x.tenantId) {
                                        <option [ngValue]="x.tenantId">{{ x.farmCode }}</option>
                                    }
                                </select>
                            </div>
                            <div class="fpms-field fpms-col-auto fpms-check-cell">
                                <div class="fpms-check fpms-check-box">
                                    <input type="checkbox" class="fpms-check-input" id="fo" [(ngModel)]="failuresOnly" />
                                    <label class="fpms-check-label" for="fo">Failures only</label>
                                </div>
                            </div>
                            <div class="fpms-field fpms-col-auto">
                                <button class="fpms-button fpms-button-primary" (click)="apply()" [disabled]="busy()">Apply</button>
                            </div>
                        </div>
                </div>
                <ul class="nav nav-tabs">
                    <li class="nav-item"><a class="nav-link" href="javascript:;" [class.active]="tab === 'login'" (click)="tab = 'login'">Sign-in attempts</a></li>
                    <li class="nav-item"><a class="nav-link" href="javascript:;" [class.active]="tab === 'events'" (click)="tab = 'events'">System events</a></li>
                </ul>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (tab === 'login') {
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th>Time</th><th title="Farm code and the username or email typed">Sign-in as</th><th>Result</th><th>IP address</th></tr></thead>
                                <tbody>
                                    @for (a of attempts(); track $index) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ a.creationTime | farmDayOf }}<div class="fpms-muted">{{ a.creationTime | farmTime }}</div></td>
                                            <td>{{ a.userNameOrEmail }}<div class="fpms-muted">{{ a.farmCode || 'System (no farm)' }}</div></td>
                                            <td><fpms-badge [text]="a.result" [tone]="a.result === 'Success' ? 'success' : 'danger'"></fpms-badge></td>
                                            <td>{{ a.clientIpAddress }}</td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="4" class="fpms-align-center fpms-muted fpms-space-y-3">No sign-in attempts in this range.</td></tr>
                                    }
                                </tbody>
                            </table>
                        } @else {
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th>Time</th><th title="Farm and user ID">Who</th><th title="Service and method">Action</th><th class="fpms-align-end">ms</th><th>Result</th></tr></thead>
                                <tbody>
                                    @for (e of events(); track $index) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ e.executionTime | farmDayOf }}<div class="fpms-muted">{{ e.executionTime | farmTime }}</div></td>
                                            <td>{{ farmCode(e.tenantId) }}<div class="fpms-muted">{{ e.userId != null ? 'User ' + e.userId : 'No user' }}</div></td>
                                            <td class="fpms-break-any">{{ e.method }}<div class="fpms-muted">{{ e.service }}</div></td>
                                            <td class="fpms-align-end">{{ e.durationMs }}</td>
                                            <td>
                                                @if (e.failed) {
                                                    <fpms-badge text="Failed" tone="danger"></fpms-badge><div class="fpms-break-any">{{ e.errorType }}</div>
                                                } @else {
                                                    <fpms-badge text="OK" tone="success"></fpms-badge>
                                                }
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="5" class="fpms-align-center fpms-muted fpms-space-y-3">No events in this range.</td></tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                    @if (tab === 'login') {
                        <fpms-pager [state]="loginPager" (changed)="load()"></fpms-pager>
                    } @else {
                        <fpms-pager [state]="eventPager" (changed)="load()"></fpms-pager>
                    }
                </div>
                <p class="fpms-muted">These logs never include farm record contents, request parameters or passwords.</p>
            </div>
        </section>
    `,
})
export class SecurityLogsComponent extends FpmsPage implements OnInit {
    attempts = signal<any[]>([]);
    events = signal<any[]>([]);
    farms = signal<any[]>([]);
    tab: 'login' | 'events' = 'login';
    from = FarmTime.addDays(FarmTime.today(), -7);
    to = FarmTime.today();
    tenantId: number | null = null;
    failuresOnly = false;
    loginPager = new PagerState();
    eventPager = new PagerState();

    ngOnInit(): void {
        this.api.get<any[]>('SystemFarm', 'GetFarms').then((f) => this.farms.set(f ?? []));
        this.load();
    }

    farmCode(tenantId: number | null): string {
        return tenantId ? (this.farms().find((f) => f.tenantId === tenantId)?.farmCode ?? String(tenantId)) : '(host)';
    }

    apply(): void {
        this.loginPager.reset();
        this.eventPager.reset();
        this.load();
    }

    async load(): Promise<void> {
        const input = {
            fromUtc: this.from ? FarmTime.fromLocalInput(`${this.from}T00:00`) : null,
            toUtc: this.to ? FarmTime.fromLocalInput(`${FarmTime.addDays(this.to, 1)}T00:00`) : null,
            tenantId: this.tenantId,
            failuresOnly: this.failuresOnly,
        };
        await this.run(async () => {
            const [a, e] = await Promise.all([
                this.api.get<any>('SecurityLog', 'GetLoginAttempts', { ...input, ...this.loginPager.params }),
                this.api.get<any>('SecurityLog', 'GetSystemEvents', { ...input, ...this.eventPager.params }),
            ]);
            this.attempts.set(a.items);
            this.events.set(e.items);
            const stale = this.loginPager.update(a.totalCount) || this.eventPager.update(e.totalCount);
            if (stale) {
                await this.load();
            }
        });
    }
}
