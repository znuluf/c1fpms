import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';
import { whereItWent, WhereRow } from '@shared/fpms/crates';
import { DisposalReasons } from '@shared/fpms/labels';

/** Read-oriented home for one harvest; editing and tally entry remain dedicated workflows. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    styles: [`
        .fpms-harvest-tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            white-space: nowrap;
            scrollbar-width: thin;
        }
        .fpms-harvest-tabs .nav-link {
            white-space: nowrap;
        }
    `],
    template: `
        <fpms-page-header
            [title]="harvest ? (harvest.lotCode ? 'Harvest · ' + harvest.lotCode : 'Harvest') : 'Harvest'"
            [subtitle]="harvest ? (harvest.pondCode || batch?.pondCode || 'Pond') + ' · ' + (harvest.batchCode || batch?.batchCode || 'Batch') + ' · ' + (harvest.harvestedAtUtc | farmDate) : 'Harvest record'"
            backLink="/app/harvests"
            backLabel="Harvests">
            @if (harvest) {
                <a class="btn btn-outline-secondary" [routerLink]="['/app/harvests', harvest.id, 'tally']">
                    <i class="fas fa-clipboard-list mr-1" aria-hidden="true"></i> Tally sheet
                </a>
                @if (can('Farm.Sales') && sellableKg() > 0) {
                    <a class="btn btn-outline-primary" routerLink="/app/sales/new" [queryParams]="{ harvestId: harvest.id }">
                        <i class="fas fa-cash-register mr-1" aria-hidden="true"></i> Record sale
                    </a>
                }
                @if (harvest.canEdit && harvest.unaccountedKg > 0) {
                    <a class="btn btn-outline-secondary" [routerLink]="['/app/harvests', harvest.id, 'edit']">
                        <i class="fas fa-clipboard-check mr-1" aria-hidden="true"></i> Account for remaining kg
                    </a>
                }
                @if (harvest.canEdit) {
                    <a class="btn btn-primary" [routerLink]="['/app/harvests', harvest.id, 'edit']">
                        <i class="fas fa-edit mr-1" aria-hidden="true"></i> Edit harvest
                    </a>
                }
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                @if (loading) {
                    <fpms-loading></fpms-loading>
                } @else if (!harvest) {
                    <fpms-empty text="This harvest could not be found or you do not have access to it." icon="fas fa-shrimp">
                        <a routerLink="/app/harvests" class="btn btn-sm btn-outline-primary">Back to harvests</a>
                    </fpms-empty>
                } @else {
                    <nav class="nav nav-tabs mb-3 fpms-harvest-tabs" aria-label="Harvest sections">
                        <a class="nav-link active" href="#overview">Overview</a>
                        <a class="nav-link" href="#breakdown">Size grades</a>
                        <a class="nav-link" href="#where-it-went">Dispatches &amp; sales</a>
                        <a class="nav-link" [routerLink]="['/app/harvests', harvest.id, 'tally']">Harvest tally</a>
                    </nav>
                    <div class="row" id="overview">
                        <div class="col-6 col-lg-3 mb-3">
                            <div class="small-box bg-light mb-0"><div class="inner"><h3>{{ harvest.totalKg | num: 2 }}</h3><p>Total harvested · kg</p></div></div>
                        </div>
                        <div class="col-6 col-lg-3 mb-3">
                            <div class="small-box bg-light mb-0"><div class="inner"><h3>{{ harvest.abwG == null ? '—' : (harvest.abwG | num: 2) }}</h3><p>Average body weight · g</p></div></div>
                        </div>
                        <div class="col-6 col-lg-3 mb-3">
                            <div class="small-box bg-light mb-0"><div class="inner"><h3>{{ harvest.boxes ?? '—' }}</h3><p>Crates</p></div></div>
                        </div>
                        <div class="col-6 col-lg-3 mb-3">
                            <div class="small-box bg-light mb-0"><div class="inner"><h3>{{ harvest.finalCount == null ? '—' : (harvest.finalCount | num: 0) }}</h3><p>Pieces counted</p></div></div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-lg-7 mb-3">
                            <div class="card h-100">
                                <div class="card-header"><h3 class="card-title">Harvest information</h3><fpms-badge [text]="harvest.harvestType | label: L.HarvestTypes"></fpms-badge></div>
                                <div class="card-body">
                                    <dl class="row mb-0">
                                        <dt class="col-sm-5">Harvest reference</dt><dd class="col-sm-7">{{ harvest.lotCode || 'Not assigned' }}</dd>
                                        <dt class="col-sm-5">Pond</dt><dd class="col-sm-7">{{ harvest.pondCode || batch?.pondCode || '—' }}</dd>
                                        <dt class="col-sm-5">Batch</dt><dd class="col-sm-7"><a [routerLink]="['/app/production/batches', harvest.batchId]">{{ harvest.batchCode || batch?.batchCode || 'View batch' }}</a></dd>
                                        <dt class="col-sm-5">Cycle</dt><dd class="col-sm-7">{{ batch?.cycleCode || '—' }}</dd>
                                        <dt class="col-sm-5">Batch status</dt><dd class="col-sm-7">@if (batch) { <fpms-badge [text]="batch.status | label: L.BatchStatuses"></fpms-badge> } @else { — }</dd>
                                        @if (harvest.harvestType === 3) {
                                            <dt class="col-sm-5">Emergency reason</dt><dd class="col-sm-7">{{ emergencyReasonLabel() }}</dd>
                                            <dt class="col-sm-5">Shrimp remained</dt><dd class="col-sm-7">{{ harvest.shrimpLeft == null ? 'Not recorded' : harvest.shrimpLeft ? 'Yes' : 'No' }}</dd>
                                        }
                                        <dt class="col-sm-5">Buyer recorded</dt><dd class="col-sm-7">{{ harvest.buyerName || 'Not specified' }}</dd>
                                        <dt class="col-sm-5">Recorded by</dt><dd class="col-sm-7">{{ harvest.weighedByName || harvest.recordedByName || '—' }}</dd>
                                        <dt class="col-sm-5">Notes</dt><dd class="col-sm-7 text-break">{{ harvest.qualityNotes || harvest.emergencyNote || '—' }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-5 mb-3">
                            <div class="card h-100">
                                <div class="card-header"><h3 class="card-title">Harvest quantity</h3></div>
                                <div class="card-body">
                                    <dl class="row mb-0">
                                        <dt class="col-7">Total harvested</dt><dd class="col-5 text-right font-weight-bold">{{ harvest.totalKg | num: 2 }} kg</dd>
                                        <dt class="col-7">Sold</dt><dd class="col-5 text-right">{{ harvest.soldKg | num: 2 }} kg</dd>
                                        <dt class="col-7">Recorded as not sold</dt><dd class="col-5 text-right">{{ harvest.notSoldKg | num: 2 }} kg</dd>
                                        <dt class="col-7">Awaiting outcome / available</dt><dd class="col-5 text-right">{{ harvest.unaccountedKg | num: 2 }} kg</dd>
                                    </dl>
                                    <div class="mt-3">
                                        <a class="btn btn-outline-primary btn-block" [routerLink]="['/app/harvests', harvest.id, 'tally']">Open harvest tally</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    @if (harvest.gradeLines?.length) {
                        <div class="card mb-3" id="breakdown">
                            <div class="card-header"><h3 class="card-title">Harvest breakdown</h3></div>
                            <div class="card-body p-0 table-responsive">
                                <table class="table mb-0">
                                    <thead><tr><th>Size grade</th><th class="text-right">Harvested · kg</th><th class="text-right">Sold · kg</th><th class="text-right">Remaining · kg</th></tr></thead>
                                    <tbody>
                                        @for (g of harvest.gradeLines; track g.sizeGradeId) {
                                            <tr><td>{{ g.sizeLabel }}</td><td class="text-right">{{ g.kg | num: 2 }}</td><td class="text-right">{{ g.soldKg | num: 2 }}</td><td class="text-right">{{ g.unsoldKg | num: 2 }}</td></tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                    @if (whereRows().length) {
                        <div class="card" id="where-it-went">
                            <div class="card-header"><h3 class="card-title">Where this harvest went</h3></div>
                            <div class="card-body p-0 table-responsive">
                                <table class="table mb-0">
                                    <thead><tr><th>Went to</th><th>Dispatch receipt</th><th class="text-right">Crates</th><th class="text-right">Kg</th><th class="text-right">Amount</th></tr></thead>
                                    <tbody>
                                        @for (r of whereRows(); track $index) {
                                            <tr [class.fpms-clickable-row]="!!r.saleId" [attr.tabindex]="r.saleId ? 0 : null" [attr.role]="r.saleId ? 'link' : null" (click)="openSale(r.saleId, $event)" (keydown.enter)="openSale(r.saleId, $event)">
                                                <td>{{ r.to }}</td>
                                                <td class="text-nowrap">
                                                    @if (r.saleId) {
                                                        <a (click)="$event.stopPropagation()" [routerLink]="['/app/sales', r.saleId]">{{ r.receipt }}</a>
                                                        <a class="small ml-2" (click)="$event.stopPropagation()" [routerLink]="['/app/sales', r.saleId, 'tally']">Tally sheet</a>
                                                    } @else { {{ r.receipt }} }
                                                </td>
                                                <td class="text-right">{{ r.crates }}</td>
                                                <td class="text-right">{{ r.kg | num: 2 }}</td>
                                                <td class="text-right">{{ r.amount != null ? (r.amount | php) : '' }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                }
            </div>
        </section>
    `,
})
export class HarvestDetailComponent extends FpmsPage implements OnInit {
    loading = true;
    harvest: any = null;
    batch: any = null;
    sheet: any = null;

    ngOnInit(): void {
        this.route.paramMap.subscribe(() => void this.load());
    }

    emergencyReasonLabel(): string {
        return this.Options.emergencyReason.find((reason: any) => reason.value === this.harvest?.emergencyReason)?.label ?? 'Not recorded';
    }

    openSale(id: string | null | undefined, event: Event): void {
        if (!id) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('a, button, input, select, textarea, [role="button"]')) return;
        if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
        this.router.navigate(['/app/sales', id]);
    }

    sellableKg(): number {
        return (this.harvest?.gradeLines ?? []).reduce((sum: number, line: any) => sum + (Number(line.unsoldKg) || 0), 0);
    }

    whereRows(): WhereRow[] {
        return whereItWent(this.harvest, this.sheet?.showsSales ? (this.sheet.sales ?? []) : [], DisposalReasons);
    }

    async load(): Promise<void> {
        this.loading = true;
        this.harvest = null;
        this.batch = null;
        this.sheet = null;
        try {
            const id = this.param('id');
            this.harvest = await this.api.get<any>('Harvest', 'Get', { id });
            if (!this.harvest) return;
            const results = await Promise.allSettled([
                this.api.get<any>('Batch', 'Get', { id: this.harvest.batchId }),
                this.api.get<any>('TallySheet', 'GetPrint', { harvestId: id }),
            ]);
            if (results[0].status === 'fulfilled') this.batch = results[0].value;
            if (results[1].status === 'fulfilled') this.sheet = results[1].value;
        } catch {
            this.harvest = null;
        } finally {
            this.loading = false;
        }
    }
}
