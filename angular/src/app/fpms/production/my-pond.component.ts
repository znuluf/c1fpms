import { Component, OnInit, effect, signal, untracked } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { batchShort, joinNames } from '@shared/fpms/labels';
import { FPMS_IMPORTS } from '../shared-imports';
import { BatchDailyRecordComponent } from './batch-daily-record.component';
import { BatchFiguresComponent } from './batch-figures.component';

/**
 * My pond (DEC-127): the batch a technician looks after, on one page — who covers, the headline figures, and today's
 * Daily record open for recording. Nothing here is a task or a deadline (DEC-31); it is the batch page made short.
 */
@Component({
    standalone: true,
    imports: [FPMS_IMPORTS, BatchDailyRecordComponent, BatchFiguresComponent],
    template: `
        <fpms-page-header
            [title]="(mine()?.length ?? 0) > 1 ? 'My ponds' : 'My pond'"
            [subtitle]="b() ? b().pondCode + ' · ' + batchShort(b().batchCode) + ' · cycle ' + b().cycleCode + (b().indicators?.doc != null ? ' · day ' + b().indicators.doc + ' of culture' : '') + '.' : ''">
            @if (b(); as x) {
                <!-- Recording happens in the Daily record below ("Record for this day" and its rows), so the header keeps only the batch page. -->
                <a class="btn btn-outline-primary" [routerLink]="['/app/production/batches', x.id]"><i class="fas fa-seedling mr-1" aria-hidden="true"></i>Batch page</a>
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                @if (mine() === null) {
                    <fpms-loading></fpms-loading>
                } @else if (failed()) {
                    <div class="alert alert-danger d-flex align-items-center">
                        <i class="fas fa-exclamation-circle mr-2" aria-hidden="true"></i>
                        <span class="mr-auto">Your pond did not load. Check the connection, then try again.</span>
                        <button type="button" class="btn btn-sm btn-outline-danger" [disabled]="busy()" (click)="init()">Try again</button>
                    </div>
                } @else if (!mine()!.length) {
                    <fpms-empty icon="fas fa-user" text="No pond is named for you yet. The Farm Owner names who looks after each batch, on the batch page. Until then, every stocked pond is on Daily log status.">
                        <a class="btn btn-outline-primary" routerLink="/app/logbook/status">Daily log status</a>
                    </fpms-empty>
                } @else {
                    @if (mine()!.length > 1) {
                        <div class="fpms-toolbar"><div role="group" aria-label="Your ponds">
                            @for (m of mine(); track m.id) {
                                <button type="button" class="fpms-chip" [attr.aria-pressed]="m.id === b()?.id" [disabled]="busy()" (click)="pick(m.id)">{{ m.pondCode }} · {{ batchShort(m.batchCode) }}</button>
                            }
                        </div></div>
                    }
                    @if (!b()) {
                        <fpms-loading></fpms-loading>
                    } @else {
                        @let x = b();
                        <section class="fpms-summary" aria-label="Summary">
                            @if (x.indicators) {
                                <fpms-batch-figures [indicators]="x.indicators" [closed]="x.status === 5" [stockingDate]="x.stockingDate"></fpms-batch-figures>
                            }
                            <ul class="fpms-notices">
                                <li>
                                    <i class="fas fa-user" aria-hidden="true"></i>
                                    <span>
                                        @if (x.coverActive) {
                                            <strong>{{ x.coverName }}</strong> covers{{ x.coverUntil ? ' until ' + (x.coverUntil | farmDate) : '' }} for {{ x.technicianName }}.
                                        } @else {
                                            {{ mine()!.length > 1 ? 'You look after ' + mine()!.length + ' ponds; this is ' + x.pondCode : 'You look after this batch' }}{{ partners(x) ? ', with ' + partners(x) : '' }}.
                                        }
                                        Anyone on the farm can still record for it.
                                    </span>
                                </li>
                                @if (x.earliestSafeHarvestDate && x.earliestSafeHarvestDate > today) {
                                    <li class="warn">
                                        <i class="fas fa-prescription-bottle-alt" aria-hidden="true"></i>
                                        <span>Earliest safe harvest, after treatment withdrawal: <strong>{{ x.earliestSafeHarvestDate | farmDate }}</strong>.</span>
                                    </li>
                                }
                            </ul>
                        </section>
                        <fpms-batch-daily-record
                            [batch]="x"
                            [calendar]="calendar()"
                            [startInEdit]="true"
                            [canRecord]="!x.isReadOnly && x.allowedLogTypes.length > 0 && can('Farm.Logs.Create')"
                            (record)="drawer.open({ batchId: x.id, date: $event })"></fpms-batch-daily-record>
                    }
                }
            </div>
        </section>
    `,
})
export class MyPondComponent extends FpmsPage implements OnInit {
    readonly batchShort = batchShort;
    /** The open batches this person looks after; null while loading. */
    readonly mine = signal<any[] | null>(null);
    readonly b = signal<any>(null);
    readonly calendar = signal<any>(null);
    readonly failed = signal(false);

    /** Reloads after a save in the log drawer, as the batch page does. */
    private readonly reloadOnDrawerSave = (() => {
        let first = true;
        return effect(() => {
            this.drawer.saved();
            if (first) {
                first = false;
                return;
            }
            untracked(() => {
                const id = this.b()?.id;
                if (id) {
                    void this.show(id);
                }
            });
        });
    })();

    /** The others who look after this batch with the signed-in person (DEC-127), as one phrase. */
    partners(x: any): string {
        const me = `${this.session.user?.name ?? ''} ${this.session.user?.surname ?? ''}`.trim();
        return joinNames((x.technicianNames ?? []).filter((n: string) => n !== me));
    }

    ngOnInit(): void {
        void this.init();
    }

    async init(): Promise<void> {
        this.failed.set(false);
        const all = await this.run(() => this.api.get<any[]>('Batch', 'GetAll', { openOnly: true }));
        if (!all) {
            this.failed.set(true);
            this.mine.set([]);
            return;
        }
        const mine = all.filter((x) => x.isMine).sort((x, y) => String(x.pondCode).localeCompare(String(y.pondCode), undefined, { numeric: true }));
        this.mine.set(mine);
        const wanted = this.query('batchId');
        const first = mine.find((x) => x.id === wanted) ?? mine[0];
        if (first) {
            await this.show(first.id);
        }
    }

    /** Switches pond and keeps it in the address, so a refresh or Back returns to it. */
    pick(id: string): void {
        this.router.navigate([], { relativeTo: this.route, queryParams: { batchId: id }, replaceUrl: true });
        void this.show(id);
    }

    async show(id: string): Promise<void> {
        const [b, cal] = await Promise.all([this.api.get<any>('Batch', 'Get', { id }), this.run(() => this.api.get<any>('Batch', 'GetLogCalendar', { id }))]);
        this.calendar.set(cal ?? null);
        this.b.set(b);
        this.setPageTitle(`My pond ${b.pondCode}`);
    }
}
