import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';
import { TimeListComponent } from '@shared/fpms/time-list.component';

/**
 * Farm Settings: operational defaults and display preferences.
 * Uses the dedicated FarmSettings endpoint so operational preferences stay separate from farm identity.
 */
@Component({
    standalone: true,
    imports: [...FPMS_IMPORTS, TimeListComponent],
    template: `
        <fpms-page-header [narrow]="true" title="Farm settings" subtitle="Production defaults, monitoring practices and system preferences."></fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid fpms-narrow">
                @if (!p) {
                    <fpms-loading></fpms-loading>
                } @else {
                    @if (canEdit) {
                        <form #f="ngForm" class="fpms-form-stack" (ngSubmit)="save()" fpmsReview="farm settings" novalidate>
                            <fieldset [disabled]="busy()">
                                <div class="card">
                                    <div class="card-header"><h3 class="card-title">Production settings</h3></div>
                                    <div class="card-body">
                                        <div class="form-group">
                                            <label for="fsys">Default farming system</label>
                                            <select id="fsys" class="form-control" name="farmingSystem" [(ngModel)]="p.farmingSystem">
                                                @for (o of Options.farmingSystem; track o.value) {
                                                    <option [ngValue]="o.value">{{ o.label }}</option>
                                                }
                                            </select>
                                            <small class="form-text text-muted">Used by each pond unless that pond has its own farming system.</small>
                                        </div>
                                        <div class="form-group mb-0">
                                            <span class="fpms-group-label" id="ftimes-l">Default feeding schedule</span>
                                            <fpms-time-list name="feedingTimes" [(ngModel)]="p.feedingTimes"></fpms-time-list>
                                            <small class="form-text text-muted">One feeding per day for each time, from 1 to 8. The feeding sheet uses this schedule.</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="card">
                                    <div class="card-header"><h3 class="card-title">Monitoring settings</h3></div>
                                    <div class="card-body">
                                        <div class="fpms-setting">
                                            <div class="custom-control custom-checkbox">
                                                <input type="checkbox" class="custom-control-input" id="wqd" name="waterQualityDaily" [(ngModel)]="p.waterQualityDaily" />
                                                <label class="custom-control-label" for="wqd">Water quality is tested every day</label>
                                            </div>
                                            <small class="form-text text-muted">Turn this off if the farm tests water only on selected days. A day without a reading will not be counted as a missing daily test.</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="card">
                                    <div class="card-header"><h3 class="card-title">System preferences</h3></div>
                                    <div class="card-body">
                                        <div class="form-row">
                                            <div class="form-group col-md-6">
                                                <label for="alert">Permit expiry reminder</label>
                                                <div class="input-group">
                                                    <input id="alert" type="number" min="1" max="365" class="form-control" name="documentExpiryAlertDays" [(ngModel)]="p.documentExpiryAlertDays" required />
                                                    <div class="input-group-append"><span class="input-group-text">days before expiry</span></div>
                                                </div>
                                                <small class="form-text text-muted">Permits expiring within this period are marked as expiring soon.</small>
                                            </div>
                                            <div class="form-group col-md-6">
                                                <label for="ufu">Follow up unsold shrimp</label>
                                                <div class="input-group">
                                                    <input id="ufu" type="number" min="1" max="60" step="1" class="form-control" name="unsoldFollowUpDays" [(ngModel)]="p.unsoldFollowUpDays" required />
                                                    <div class="input-group-append"><span class="input-group-text">days after harvest</span></div>
                                                </div>
                                                <small class="form-text text-muted">Shrimp not yet sold or accounted for are listed on the dashboard after this many days. Each harvest can use its own day.</small>
                                            </div>
                                            <div class="form-group col-md-6">
                                                <label for="tz">Farm time zone</label>
                                                <input id="tz" type="text" class="form-control" name="timeZone" [(ngModel)]="p.timeZone" required maxlength="64" placeholder="Asia/Manila" />
                                                <small class="form-text text-muted">IANA time zone used for farm dates and reports, for example Asia/Manila.</small>
                                            </div>
                                            <div class="form-group col-md-6">
                                                <label for="dord">Date display</label>
                                                <select id="dord" class="form-control" name="dateOrder" [(ngModel)]="p.dateOrder">
                                                    <option [ngValue]="1">Month first (Oct 22, 2026)</option>
                                                    <option [ngValue]="2">Day first (22 Oct 2026)</option>
                                                </select>
                                            </div>
                                            <div class="form-group col-md-6 mb-0">
                                                <label for="tfmt">Time display</label>
                                                <select id="tfmt" class="form-control" name="use24HourTime" [(ngModel)]="p.use24HourTime">
                                                    <option [ngValue]="false">12-hour (2:30 PM)</option>
                                                    <option [ngValue]="true">24-hour (14:30)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </fieldset>
                            <div class="fpms-form-foot">
                                <button type="submit" class="btn btn-primary" [disabled]="busy() || !f.form.valid">
                                    @if (busy()) { <i class="fas fa-spinner fa-spin mr-1"></i> }
                                    Save settings
                                </button>
                                <button type="button" class="btn btn-default" [disabled]="busy()" (click)="f.form.markAsPristine(); load()">Cancel</button>
                                <fpms-form-hint [form]="f"></fpms-form-hint>
                            </div>
                        </form>
                    } @else {
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Production settings</h3></div>
                            <div class="card-body">
                                <dl class="row mb-0 fpms-dl">
                                    <dt class="col-sm-4">Farming system</dt><dd class="col-sm-8">{{ p.farmingSystem | label: L.FarmingSystems }}</dd>
                                    <dt class="col-sm-4">Feeding schedule</dt><dd class="col-sm-8">{{ feedingCount() }} a day: {{ p.feedingTimes }}</dd>
                                </dl>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Monitoring settings</h3></div>
                            <div class="card-body">{{ p.waterQualityDaily === false ? 'Water is tested on selected days.' : 'Water is tested every day.' }}</div>
                        </div>
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">System preferences</h3></div>
                            <div class="card-body">
                                <dl class="row mb-0 fpms-dl">
                                    <dt class="col-sm-4">Permit reminder</dt><dd class="col-sm-8">{{ p.documentExpiryAlertDays }} days before expiry</dd>
                                    <dt class="col-sm-4">Unsold shrimp follow-up</dt><dd class="col-sm-8">{{ p.unsoldFollowUpDays }} days after harvest</dd>
                                    <dt class="col-sm-4">Time zone</dt><dd class="col-sm-8">{{ p.timeZone }}</dd>
                                    <dt class="col-sm-4">Date display</dt><dd class="col-sm-8">{{ p.dateOrder === 2 ? 'Day first' : 'Month first' }}</dd>
                                    <dt class="col-sm-4">Time display</dt><dd class="col-sm-8">{{ p.use24HourTime ? '24-hour (14:30)' : '12-hour (2:30 PM)' }}</dd>
                                </dl>
                            </div>
                        </div>
                        <p class="text-muted small"><i class="fas fa-lock mr-1"></i>Only a Farm Owner can change farm settings.</p>
                    }
                }
            </div>
        </section>
    `,
})
export class FarmSettingsComponent extends FpmsPage implements OnInit {
    p: any = null;

    get canEdit(): boolean {
        return this.can('Farm.Settings.Edit');
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.p = await this.api.get<any>('FarmSettings', 'Get');
    }

    feedingCount(): number {
        return String(this.p?.feedingTimes ?? '').split(',').filter((t) => t.trim()).length;
    }

    async save(): Promise<void> {
        if (await this.act(async () => this.api.put<void>('FarmSettings', 'Update', this.p))) {
            FarmTime.setZone(this.p.timeZone);
            FarmTime.setDisplay(this.p.dateOrder, this.p.use24HourTime);
            this.notifySaved('Farm settings saved.');
            await this.load();
        }
    }
}
