import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime } from '@shared/fpms/farm-time';
import { FPMS_IMPORTS } from '../shared-imports';

/** Advance stocking plans; deliberately separate from actual batch stocking and DOC. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Stocking plans" subtitle="Plan upcoming pond stocking without starting a production batch or DOC.">
            <a class="btn btn-outline-secondary" routerLink="/app/production/cycles">Production cycles</a>
            @if (can('Farm.Production.Manage')) {
                <button class="btn btn-primary" (click)="startNew()"><i class="fas fa-plus mr-1"></i>Plan stocking</button>
            }
        </fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid">
                @if (form()) {
                    <div class="card card-outline card-primary mb-3">
                        <div class="card-header"><h3 class="card-title">{{ form()!.id ? 'Edit stocking plan' : 'Plan pond stocking' }}</h3></div>
                        <div class="card-body">
                            <p class="text-muted small">This is a planning record only. It does not reserve fry, create a batch, or start DOC. Confirm actual stocking later through <strong>Stock a batch</strong>.</p>
                            <div class="form-row">
                                <div class="form-group col-md-4">
                                    <label for="ps-pond">Grow-out pond</label>
                                    <select id="ps-pond" class="form-control" [(ngModel)]="form()!.pondId">
                                        <option value="">Choose a pond</option>
                                        @for (p of ponds(); track p.id) { <option [value]="p.id">{{ p.pondCode }} · {{ p.name || 'Grow-out pond' }}</option> }
                                    </select>
                                </div>
                                <div class="form-group col-md-4">
                                    <label for="ps-date">Planned stocking date</label>
                                    <input id="ps-date" type="date" class="form-control" [min]="today" [(ngModel)]="form()!.plannedDate" />
                                </div>
                                <div class="form-group col-md-4">
                                    <label for="ps-delivery">Expected fry delivery (optional)</label>
                                    <select id="ps-delivery" class="form-control" [(ngModel)]="form()!.fryDeliveryId">
                                        <option value="">Not linked yet</option>
                                        @for (d of deliveries(); track d.id) { <option [value]="d.id">{{ d.hatcheryBatchNumber }} · {{ d.hatcheryName }} · {{ deliveryStatus(d.status) }}</option> }
                                    </select>
                                    <small class="form-text text-muted">Linking a delivery is for coordination only; it does not allocate PL.</small>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="ps-notes">Notes (optional)</label>
                                <textarea id="ps-notes" class="form-control" rows="2" maxlength="500" [(ngModel)]="form()!.notes" placeholder="Preparation, staffing, or delivery coordination"></textarea>
                            </div>
                        </div>
                        <div class="card-footer">
                            <button class="btn btn-primary mr-2" [disabled]="saving() || !form()!.pondId || !form()!.plannedDate" (click)="save()">{{ saving() ? 'Saving…' : 'Save plan' }}</button>
                            <button class="btn btn-default" [disabled]="saving()" (click)="form.set(null)">Cancel</button>
                        </div>
                    </div>
                }
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Planned stocking events</h3></div>
                    <div class="card-body p-0 table-responsive">
                        @if (plans() === null) {
                            <fpms-loading></fpms-loading>
                        } @else if (!plans()!.length) {
                            <fpms-empty text="No stocking plans yet. Add a planned date to coordinate pond preparation and fry delivery before actual stocking." icon="fas fa-calendar-alt"></fpms-empty>
                        } @else {
                            <table class="table table-hover mb-0">
                                <thead><tr><th>Planned date</th><th>Pond</th><th>Fry delivery</th><th>Notes</th><th>Status</th>@if (can('Farm.Production.Manage')) { <th class="text-right">Actions</th> }</tr></thead>
                                <tbody>
                                    @for (p of plans(); track p.id) {
                                        <tr>
                                            <td class="text-nowrap">{{ p.plannedDate | farmDate }}</td>
                                            <td><strong>{{ p.pondCode }}</strong></td>
                                            <td>{{ p.hatcheryBatchNumber || 'Not linked' }}<div class="text-muted small">{{ p.hatcheryName || '' }}</div></td>
                                            <td>{{ p.notes || '—' }}</td>
                                            <td><fpms-badge [text]="p.status === 1 ? 'Planned' : 'Cancelled'"></fpms-badge></td>
                                            @if (can('Farm.Production.Manage')) {
                                                <td class="text-right text-nowrap">
                                                    @if (p.status === 1) {
                                                        <button class="btn btn-sm btn-outline-primary mr-1" (click)="edit(p)">Edit</button>
                                                        <button class="btn btn-sm btn-outline-danger" (click)="cancel(p)">Cancel plan</button>
                                                    }
                                                </td>
                                            }
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
export class PlannedStockingComponent extends FpmsPage implements OnInit {
    plans = signal<any[] | null>(null);
    ponds = signal<any[]>([]);
    deliveries = signal<any[]>([]);
    form = signal<any | null>(null);
    saving = signal(false);
    readonly today = FarmTime.today();

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    async load(): Promise<void> {
        const [plans, ponds, deliveryPage] = await Promise.all([
            this.api.get<any[]>('PlannedStocking', 'GetAll'),
            this.api.get<any[]>('Pond', 'GetAll'),
            this.api.get<any>('FryDelivery', 'GetAll', { maxResultCount: 100, sorting: 'deliveryDate DESC' }),
        ]);
        this.plans.set(plans ?? []);
        this.ponds.set((ponds ?? []).filter((p) => p.purpose === 1 && p.manualStatus === 1 && !p.isArchived));
        this.deliveries.set((deliveryPage?.items ?? []).filter((d) => d.status !== 4 && d.status !== 5 && !d.isStockingFinished && (d.status !== 3 || d.plLeft > 0)));
    }

    startNew(): void {
        this.form.set({ id: null, pondId: '', plannedDate: this.today, fryDeliveryId: '', notes: '' });
    }

    edit(p: any): void {
        this.form.set({ id: p.id, pondId: p.pondId, plannedDate: String(p.plannedDate).substring(0, 10), fryDeliveryId: p.fryDeliveryId || '', notes: p.notes || '' });
    }

    deliveryStatus(status: number): string {
        return ({ 1: 'Ordered', 2: 'In transit', 3: 'Received', 4: 'Rejected', 5: 'Cancelled' } as any)[status] || 'Status unknown';
    }

    async save(): Promise<void> {
        const f = this.form();
        if (!f || !f.pondId || !f.plannedDate) return;
        this.saving.set(true);
        try {
            const ok = await this.act(() => this.api.post('PlannedStocking', 'Save', {
                id: f.id || null,
                pondId: f.pondId,
                plannedDate: f.plannedDate,
                fryDeliveryId: f.fryDeliveryId || null,
                notes: f.notes?.trim() || null,
            }));
            if (ok) {
                this.notifySaved('Stocking plan saved.');
                this.form.set(null);
                await this.load();
            }
        } finally {
            this.saving.set(false);
        }
    }

    async cancel(p: any): Promise<void> {
        if (!confirm('Cancel this stocking plan? This will not affect any actual batch or fry delivery.')) return;
        if (await this.act(() => this.api.post('PlannedStocking', 'Cancel', { id: p.id }))) {
            this.notifySaved('Stocking plan cancelled.');
            await this.load();
        }
    }
}
