import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { PagerState } from '@shared/fpms/pager';
import { FPMS_IMPORTS } from '../shared-imports';

const KINDS = [
    { value: 1, label: 'Full backup' },
    { value: 2, label: 'Log backup' },
    { value: 3, label: 'Integrity check' },
    { value: 4, label: 'Restore test' },
    { value: 5, label: 'Off-site copy' },
];

/** System Administrator health page (AC-26): version, database and disk, backup history, certificate and live alerts. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="System health" subtitle="Backups, storage, certificate and server errors. System Administration.">
            <button class="fpms-button fpms-button-secondary" (click)="reload()" [disabled]="busy()"><i class="fas fa-sync-alt fpms-icon-gap"></i>Refresh</button>
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner">
                @if (!health()) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @let h = health();
                    <!-- Summary band (DEC-122): the figures, then the alerts as notices, or one line saying all is well. -->
                    <section class="fpms-summary" aria-label="Summary">
                        <dl class="fpms-figures">
                            <div class="fpms-figure" [class.warn]="h.databaseSizeGb > 8"><dt class="l">Database size</dt><dd class="v">{{ h.databaseSizeGb != null ? (h.databaseSizeGb | num: 2) : '—' }}<span class="u">GB</span></dd><dd class="s">Limit 10 GB</dd></div>
                            <div class="fpms-figure"><dt class="l">Disk free</dt><dd class="v">{{ h.freeDiskPct != null ? (h.freeDiskPct | num: 1) : '—' }}<span class="u">%</span></dd><dd class="s">{{ h.freeDiskGb != null ? (h.freeDiskGb | num: 1) + ' GB' : '' }}</dd></div>
                            <div class="fpms-figure" [class.warn]="h.errorsLast24Hours > 0"><dt class="l">Server errors</dt><dd class="v">{{ h.errorsLast24Hours }}</dd><dd class="s">Last 24 hours</dd></div>
                            <div class="fpms-figure"><dt class="l">Version</dt><dd class="v">{{ h.appVersion }}</dd><dd class="s">Built {{ h.buildDateUtc | farmDate }}</dd></div>
                        </dl>
                        <ul class="fpms-notices">
                            @for (a of h.alerts; track a.code) {
                                <li [class.error]="a.severity === 2" [class.warn]="a.severity !== 2">
                                    <i class="fas" [class.fa-times-circle]="a.severity === 2" [class.fa-exclamation-triangle]="a.severity !== 2" aria-hidden="true"></i>
                                    <span><strong>{{ a.severity === 2 ? 'Critical' : 'Warning' }}:</strong> {{ a.message }}</span>
                                </li>
                            } @empty {
                                <li><i class="fas fa-check-circle fpms-success" aria-hidden="true"></i><span>No alerts. Backups are current and storage is fine.</span></li>
                            }
                        </ul>
                    </section>
                    <div class="fpms-panel">
                        <div class="fpms-panel-head"><h3 class="fpms-panel-title">Last successful runs</h3></div>
                        <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead><tr><th>Job</th><th>Last success</th><th>Expected</th></tr></thead>
                                <tbody>
                                    <tr><td>Full backup</td><td>{{ h.lastFullBackupUtc ? (h.lastFullBackupUtc | farmDateTime) : 'Never recorded' }}</td><td>Daily</td></tr>
                                    <tr><td>Transaction-log backup</td><td>{{ h.lastLogBackupUtc ? (h.lastLogBackupUtc | farmDateTime) : 'Never recorded' }}</td><td>Every 30 minutes</td></tr>
                                    <tr><td>Integrity check (CHECKDB)</td><td>{{ h.lastIntegrityCheckUtc ? (h.lastIntegrityCheckUtc | farmDateTime) : 'Never recorded' }}</td><td>Weekly</td></tr>
                                    <tr><td>Off-site copy (encrypted)</td><td>{{ h.lastOffsiteCopyUtc ? (h.lastOffsiteCopyUtc | farmDateTime) : 'Never recorded' }}</td><td>Weekly</td></tr>
                                    <tr><td>Restore test</td><td>{{ h.lastRestoreTestUtc ? (h.lastRestoreTestUtc | farmDateTime) : 'Never recorded' }}</td><td>After each release and quarterly</td></tr>
                                    <tr><td>HTTPS certificate</td><td colspan="2">{{ h.certificateExpiresUtc ? 'Expires ' + (h.certificateExpiresUtc | farmDateTime) : 'Not reported by this server' }}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="fpms-panel-foot fpms-muted">Server time {{ h.serverTimeUtc | farmDateTime }} ({{ h.timeZone }}).</div>
                    </div>
                }
                <h3 class="fpms-section-h fpms-space-top-5">Backup and maintenance history</h3>
                <div class="fpms-filter-row">
                    <label class="sl-field">
                        <span>Job</span>
                        <select class="fpms-control fpms-control-compact fpms-width-auto" [(ngModel)]="kind" (ngModelChange)="pager.reset(); loadRuns()">
                            <option [ngValue]="null">All jobs</option>
                            @for (k of kinds; track k.value) {
                                <option [ngValue]="k.value">{{ k.label }}</option>
                            }
                        </select>
                    </label>
                    <div class="fpms-check fpms-check-box">
                        <input type="checkbox" class="fpms-check-input" id="fo" [(ngModel)]="failedOnly" (ngModelChange)="pager.reset(); loadRuns()" />
                        <label class="fpms-check-label" for="fo">Failures only</label>
                    </div>
                </div>
                <div class="fpms-panel">
                    <div class="fpms-panel-body fpms-space-0 fpms-table-scroll">
                        @if (!runs()) {
                            <fpms-loading></fpms-loading>
                        } @else if (!runs().length) {
                            <fpms-empty text="No runs recorded. The backup scripts write a row after each run (see the runbook)." icon="fas fa-database"></fpms-empty>
                        } @else {
                            <!-- Five columns (DEC-122): the job with its result, the file with its host. -->
                            <table class="fpms-data-table fpms-table-compact fpms-no-bottom">
                                <thead>
                                    <tr>
                                        <th fpmsSort="startedAt" [pager]="pager" (sorted)="loadRuns()">Started</th>
                                        <th fpmsSort="kind" [pager]="pager" (sorted)="loadRuns()" title="Job and result">Job</th>
                                        <th class="fpms-align-end" fpmsSort="sizeBytes" [pager]="pager" (sorted)="loadRuns()">Size</th>
                                        <th title="File and host">File</th>
                                        <th>Message</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (r of runs(); track r.id) {
                                        <tr>
                                            <td class="fpms-nowrap">{{ r.startedAtUtc | farmDayOf }}<div class="fpms-muted">{{ r.startedAtUtc | farmTime }}</div></td>
                                            <td>
                                                {{ kindLabel(r.kind) }}
                                                <div class="fpms-space-top-1"><fpms-badge [text]="r.succeeded ? 'OK' : 'Failed'" [tone]="r.succeeded ? 'success' : 'danger'"></fpms-badge></div>
                                            </td>
                                            <td class="fpms-align-end fpms-nowrap">{{ r.sizeBytes != null ? (r.sizeBytes / 1048576 | num: 1) + ' MB' : '—' }}</td>
                                            <td class="fpms-break-any">{{ r.fileName || '—' }}<div class="fpms-muted">{{ r.host }}</div></td>
                                            <td>{{ r.message }}</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        }
                    </div>
                    <fpms-pager [state]="pager" (changed)="loadRuns()"></fpms-pager>
                </div>
            </div>
        </section>
    `,
})
export class HealthComponent extends FpmsPage implements OnInit, OnDestroy {
    health = signal<any>(null);
    runs = signal<any[] | null>(null);
    readonly kinds = KINDS;
    kind: number | null = null;
    failedOnly = false;
    pager = new PagerState('startedAt desc');
    private timer: ReturnType<typeof setInterval> | undefined;

    ngOnInit(): void {
        this.reload();
        this.timer = setInterval(() => this.reload(), 60_000);
    }

    ngOnDestroy(): void {
        clearInterval(this.timer);
    }

    reload(): void {
        this.run(async () => this.health.set(await this.api.get<any>('SystemHealth', 'GetHealth')));
        this.loadRuns();
    }

    async loadRuns(): Promise<void> {
        const r = await this.api.get<any>('SystemHealth', 'GetBackupRuns', { kind: this.kind, failedOnly: this.failedOnly, ...this.pager.params });
        this.runs.set(r.items);
        if (this.pager.update(r.totalCount)) {
            await this.loadRuns();
        }
    }

    hasCritical(): boolean {
        return (this.health()?.alerts ?? []).some((a: any) => a.severity === 2);
    }

    kindLabel(kind: number): string {
        return KINDS.find((k) => k.value === kind)?.label ?? String(kind);
    }
}
