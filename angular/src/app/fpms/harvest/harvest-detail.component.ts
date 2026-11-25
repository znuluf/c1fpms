import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';

/** Read-oriented home for one harvest; editing and tally entry remain dedicated workflows. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header
            [title]="harvest ? 'Harvest · ' + (harvest.lotCode || (harvest.harvestedAtUtc | farmDate)) : 'Harvest'"
            [subtitle]="harvest ? (harvest.pondCode || batch?.pondCode || 'Pond') + ' · ' + (harvest.batchCode || batch?.batchCode || 'Batch') : 'Harvest record'"
            backLink="/app/harvests"
            backLabel="Harvests">
            @if (harvest) {
                <a class="btn btn-outline-secondary" [routerLink]="['/app/harvests', harvest.id, 'tally']">
                    <i class="fas fa-clipboard-list mr-1" aria-hidden="true"></i> Tally sheet
                </a>
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
                    <div class="row">
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
                            <div class="small-box bg-light mb-0"><div class="inner"><h3>{{ harvest.harvestedAtUtc | farmDate }}</h3><p>Harvest date</p></div></div>
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
                        <div class="card mb-3">
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
                    @if (sheet?.sales?.length) {
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Sales from this harvest</h3></div>
                            <div class="card-body p-0 table-responsive">
                                <table class="table mb-0">
                                    <thead><tr><th>Dispatch receipt</th><th>Buyer</th><th class="text-right">Farm kg</th><th class="text-right">Buyer kg</th><th></th></tr></thead>
                                    <tbody>
                                        @for (sale of sheet.sales; track sale.id) {
                                            <tr><td>{{ sale.dispatchReceiptNo }}</td><td>{{ sale.buyerName }}</td><td class="text-right">{{ sale.farmKg | num: 2 }}</td><td class="text-right">{{ sale.buyerKg | num: 2 }}</td><td class="text-right"><a class="btn btn-sm btn-outline-secondary" [routerLink]="['/app/sales', sale.id]">Open sale</a></td></tr>
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
