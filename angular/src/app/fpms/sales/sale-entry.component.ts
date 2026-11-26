import { Component, OnInit } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FarmTime, newGuid } from '@shared/fpms/farm-time';
import { FormDrafts } from '@shared/fpms/drafts';
import { FPMS_IMPORTS } from '../shared-imports';
import { PRICE_METHODS, countFromAbw, pricingBody, referencePrice, usedAbw, usedCount } from '@shared/fpms/pricing';
import { PriceTermsComponent, SalePaymentComponent, initialPaymentOf } from '@shared/fpms/pricing-ui';
import { crateKg, formatCrateNos, parseCrateNos } from '@shared/fpms/crates';

/**
 * Record or edit a sale (Ref 7.3, AC-15, step E). Lines sell kg from harvest grade lines, possibly from several harvests.
 * The buyer's accepted kg, when the buyer re-weighs, sets the amount (DEC-67). Optional due date, transport details
 * (DEC-55) and a payment received with the sale. The dispatch receipt number is assigned on save. A line's price can be
 * fixed, worked out from a base price at a base ABW or a base count, or read from a price table by count (DEC-80, DEC-82),
 * prefilled from the buyer's last terms or their price table.
 * "Sell this harvest" (?harvestId=) starts with that harvest's unsold grades and its buyer (DEC-81).
 */
@Component({
    standalone: true,
    imports: [...FPMS_IMPORTS, PriceTermsComponent, SalePaymentComponent],
    template: `
        <fpms-page-header [narrow]="true" [title]="isNew ? 'Record sale' : 'Edit sale ' + (original?.dispatchReceiptNo ?? '')" [subtitle]="isNew ? 'Sell harvested kilograms to a buyer. The dispatch receipt number is made when you save.' : ''" backLink="/app/sales" backLabel="Sales"></fpms-page-header>
        <section class="content px-2 pb-3">
            <div class="container-fluid fpms-narrow">
                @if (loading) {
                    <fpms-loading></fpms-loading>
                } @else if (!buyers.length || !sellable.length) {
                    <div class="card">
                        <div class="card-body">
                            @if (!buyers.length) {
                                <fpms-empty [text]="can('Farm.Buyers') ? 'Add an active buyer first.' : 'No active buyers are available to your account.'" icon="fas fa-handshake">@if (can('Farm.Buyers')) { <a routerLink="/app/resources/buyers" class="btn btn-sm btn-primary">Go to buyers</a> }</fpms-empty>
                            } @else {
                                <fpms-empty [text]="grading ? 'No harvest grade has kilograms left to sell. Record a harvest with its size grades first.' : 'No harvest has kilograms left to sell. Record a harvest first.'" icon="fas fa-shrimp">@if (can('Farm.Harvests')) { <a routerLink="/app/harvests" class="btn btn-sm btn-primary">Go to harvests</a> }</fpms-empty>
                            }
                        </div>
                    </div>
                } @else {
                    <!-- One panel (DEC-107): the sale's parts are sections of it, with Review sale as its footer. -->
                    @if (restoredAt) {
                        <div class="alert alert-info d-flex align-items-center" role="status">
                            <i class="fas fa-history mr-2" aria-hidden="true"></i>
                            <span class="mr-auto">Your unsaved sale from {{ restoredAt | farmDateTime }} was restored.</span>
                            <button type="button" class="btn btn-sm btn-outline-secondary" (click)="discardDraft()">Discard it</button>
                        </div>
                    }
                    <form #f="ngForm" class="fpms-form-stack" (ngSubmit)="review = true" (input)="keepDraft()" (change)="keepDraft()" novalidate>
                        <div class="card">
                            <div class="card-body">
                                <div class="form-row">
                                    <div class="form-group col-md-8 mb-0">
                                        <label for="by">Buyer <span class="text-danger">*</span></label>
                                        <select id="by" class="form-control" name="buyerId" [(ngModel)]="m.buyerId" (ngModelChange)="terms = {}" required>
                                            @for (b of buyers; track b.id) { <option [value]="b.id">{{ b.name }}</option> }
                                        </select>
                                    </div>
                                    <div class="form-group col-md-4 mb-0">
                                        <label for="sd">Sale date <span class="text-danger">*</span></label>
                                        <input id="sd" type="date" class="form-control" name="saleDate" [(ngModel)]="m.saleDate" required [max]="today" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- What was sold (DEC-107): a block per line, the harvest across the top so its name is never cut off, then
                             its kilograms, price and amount, each with its own label. -->
                        <div class="card">
                            <div class="card-header d-flex align-items-center flex-wrap">
                                <h3 class="card-title mr-auto">What was sold</h3>
                                <span>{{ totalKg() | num: 3 : true }} kg · <strong>{{ total() | php }}</strong></span>
                            </div>
                            <div class="card-body pt-0">
                                @if (abwSchemes.length) {
                                    <div class="form-group mt-3">
                                        <label for="saleAbwScheme">Base ABW pricing for this sale</label>
                                        <select id="saleAbwScheme" class="custom-select" name="saleAbwScheme" [(ngModel)]="m.abwSchemeId" (ngModelChange)="applySaleAbwScheme($event)">
                                            <option value="">Choose a scheme to apply to all lines</option>
                                            @for (s of abwSchemes; track s.id) { <option [value]="s.id">{{ s.name }} · base {{ s.baseAbwG }}g</option> }
                                        </select>
                                        <small class="form-text text-muted">The selected terms are copied to every sale line and calculated against each harvest's ABW.</small>
                                    </div>
                                }
                                @for (l of m.lines; track $index) {
                                    <div class="fpms-sale-line">
                                        <div class="harvest">
                                            <label [for]="'g' + $index">{{ grading ? 'Harvest grade' : 'Harvest' }}</label>
                                            <select [id]="'g' + $index" class="form-control" [name]="'g' + $index" [(ngModel)]="l.harvestGradeLineId" (ngModelChange)="onGrade(l)" required>
                                                @for (o of sellable; track o.harvestGradeLineId) {
                                                    <option [value]="o.harvestGradeLineId" [disabled]="used(o.harvestGradeLineId, l)">{{ o.harvestDate | farmDate }} · {{ o.pondCode }}{{ o.lotCode ? ' · lot ' + o.lotCode : '' }}{{ gradeText(o) }} ({{ unsold(o) | num: 3 : true }} kg grade balance; {{ o.harvestAvailableKg | num: 3 : true }} kg harvest available)</option>
                                                }
                                            </select>
                                            @if (over(l)) {
                                                <small class="form-text text-danger">
                                                    @if (gradeOver(l)) { More than the {{ unsold(option(l)) | num: 3 : true }} kg left in this grade. }
                                                    @else { The sale lines total more than the {{ option(l)?.harvestAvailableKg | num: 3 : true }} kg available from this harvest after not-sold entries. }
                                                </small>
                                            }
                                        </div>
                                        <div class="rm">
                                            @if (m.lines.length > 1) {
                                                <button type="button" class="btn btn-sm btn-outline-danger" (click)="m.lines.splice($index, 1)" aria-label="Remove this line"><i class="fas fa-times" aria-hidden="true"></i></button>
                                            }
                                        </div>
                                        <div>
                                            <label [for]="'k' + $index">Farm kg <span class="text-danger">*</span></label>
                                            <input [id]="'k' + $index" type="number" min="0.001" step="0.001" class="form-control" [name]="'k' + $index" [(ngModel)]="l.kg" required />
                                        </div>
                                        <div>
                                            <label [for]="'bk' + $index">Buyer kg</label>
                                            <input [id]="'bk' + $index" type="number" min="0" step="0.001" class="form-control" [name]="'bk' + $index" [(ngModel)]="l.buyerAcceptedKg" placeholder="Same" />
                                            @if (diffPct(l) > 10) { <small class="form-text text-warning-dark">{{ diffPct(l) | num: 1 }}% off the farm kg</small> }
                                        </div>
                                        <div>
                                            <label [for]="'pm' + $index">Price agreed</label>
                                            <select [id]="'pm' + $index" class="custom-select" [name]="'pm' + $index" [(ngModel)]="l.priceMethod" (ngModelChange)="onMethod(l)">
                                                @for (o of methodsFor(l); track o.value) { <option [ngValue]="o.value">{{ o.label }}</option> }
                                            </select>
                                        </div>
                                        <div>
                                            <label [for]="'p' + $index">Price / kg (₱) <span class="text-danger">*</span></label>
                                            <input [id]="'p' + $index" type="number" min="0" step="0.01" class="form-control" [name]="'p' + $index" [(ngModel)]="l.pricePerKg" required />
                                        </div>
                                        <div class="amt">
                                            <span class="l">Amount</span>
                                            <strong>{{ amount(l) | php }}</strong>
                                        </div>
                                        @if (l.priceMethod > 1) {
                                            <div class="terms">
                                                <fpms-price-terms [t]="l" [key]="'l' + $index" [tables]="tablesFor(l)" [abw]="option(l)?.harvestAbwG ?? null" [count]="defaultCount(l)" [termsFrom]="l.termsFrom" (changed)="applyFormula(l)"></fpms-price-terms>
                                            </div>
                                        }
                                    </div>
                                }
                                <button type="button" class="btn btn-sm btn-outline-secondary mt-3" (click)="addLine()" [disabled]="m.lines.length >= sellable.length"><i class="fas fa-plus mr-1" aria-hidden="true"></i>{{ grading ? 'Add grade' : 'Add another harvest' }}</button>
                                <details class="fpms-fold mt-3 mb-0">
                                    <summary>How kg and prices work <span class="fpms-fold-hint">buyer kg, base ABW price</span></summary>
                                    <p class="mb-1">Leave Buyer kg empty when the buyer pays on the farm's weight. When it is filled, the amount uses it; yield and FCR keep the farm weight.</p>
                                    <p class="mb-0">"Base ABW pricing" works the price out from the selected base price and base ABW, adjusting for each gram above or below it; the shrimp ABW starts from the harvest's sampled ABW.</p>
                                </details>
                            </div>
                        </div>
                        @if (crateHarvests().length) {
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Crates for this buyer (optional)</h3></div>
                                <div class="card-body">
                                    <p class="small text-muted">Type the crate numbers from the harvest's tally that went to this buyer, e.g. 1-10, 15. Their dispatch receipt then lists these crates. A crate can be on one sale only.</p>
                                    @for (h of crateHarvests(); track h.id) {
                                        <div class="form-group" [class.mb-0]="$last">
                                            <label [for]="'cr' + $index">{{ h.harvestedAtUtc | farmDayOf }} · {{ h.pondCode }}{{ h.lotCode ? ' · lot ' + h.lotCode : '' }} <span class="text-muted font-weight-normal">· {{ h.crates.length }} crates, {{ freeCrates(h).length }} not on another sale</span></label>
                                            <div class="input-group">
                                                <input [id]="'cr' + $index" class="form-control" [name]="'cr' + $index" [(ngModel)]="crateText[h.id]" placeholder="e.g. 1-10, 15" autocomplete="off" />
                                                <div class="input-group-append">
                                                    <button type="button" class="btn btn-outline-secondary" (click)="takeAllCrates(h)" [disabled]="!freeCrates(h).length">All {{ freeCrates(h).length }} free crates</button>
                                                </div>
                                            </div>
                                            @if (crateError(h); as e) {
                                                <small class="form-text text-danger">{{ e }}</small>
                                            } @else if (chosenCrates(h).length) {
                                                <small class="form-text text-muted">
                                                    {{ chosenCrates(h).length }} crate(s) · {{ chosenKg(h) | num: 3 }} kg.
                                                    @if (crateMismatch(h)) {
                                                        <span class="text-warning-dark">The lines from this harvest total {{ lineKg(h) | num: 3 }} kg.</span>
                                                        @if (canUseCrateKg(h)) { <a href="javascript:;" (click)="useCrateKg(h)">Use the crates' kg</a> }
                                                    }
                                                </small>
                                            }
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                        <div class="card">
                            <div class="card-header"><h3 class="card-title">Payment</h3></div>
                            <div class="card-body">
                                <fpms-sale-payment [m]="m" key="pay" [total]="total()" [minDue]="m.saleDate" [showPaidNow]="isNew"></fpms-sale-payment>
                            </div>
                        </div>

                        @if (!review) {
                            <div class="fpms-form-foot">
                                <button type="submit" class="btn btn-primary btn-lg" [disabled]="!f.form.valid || !validLines().length || anyOver() || anyCrateError()">Review sale</button>
                                <fpms-form-hint [form]="f"></fpms-form-hint>
                            </div>
                        } @else {
                            <div class="card card-outline card-primary">
                                <div class="card-header"><h3 class="card-title">Check before saving</h3></div>
                                <div class="card-body">
                                    <p class="mb-1">{{ buyerName() }} · {{ m.saleDate | farmDate }} · {{ validLines().length }} {{ grading ? 'grade line(s)' : 'line(s)' }}{{ totalChosenCrates() ? ' · ' + totalChosenCrates() + ' crate(s)' : '' }}{{ m.dueDate ? ' · due ' + (m.dueDate | farmDate) : '' }}</p>
                                    <p class="mb-1">Total <strong>{{ totalKg() | num: 3 }} kg</strong> for <strong>{{ total() | php }}</strong>{{ isNew ? '; paid now ' + ((m.paidInFull ? total() : m.paidNow || 0) | php) : '' }}.</p>
                                    <p class="small text-muted mb-0">{{ isNew ? 'A dispatch receipt number is assigned when you save. ' : '' }}The dispatch receipt is for the farm's records, not an official receipt.</p>
                                </div>
                                <div class="card-footer">
                                    <button type="button" class="btn btn-primary mr-2" [disabled]="busy()" (click)="save()">Save sale</button>
                                    <button type="button" class="btn btn-default" (click)="review = false">Back</button>
                                </div>
                            </div>
                        }
                    </form>
                }
            </div>
        </section>
    `,
})
export class SaleEntryComponent extends FpmsPage implements OnInit {
    loading = true;
    isNew = true;
    review = false;
    /** When a restored draft was last saved on this device (DEC-133), else null. */
    restoredAt: string | null = null;
    buyers: any[] = [];
    sellable: any[] = [];
    original: any = null;
    m: any = { lines: [] };
    readonly methods = PRICE_METHODS;

    /** Price by count is offered only on a line that already uses it: the partner farm always sells by kg (DEC-90). */
    methodsFor(_l: any): typeof PRICE_METHODS {
        return PRICE_METHODS;
    }
    /** Active price tables with their rows (DEC-82). */
    tables: any[] = [];
    /** Active farm-level Base ABW presets; selected terms are copied onto each sale line. */
    abwSchemes: any[] = [];
    /** Harvests with a crate tally, loaded as the sale's lines name them (DEC-86): id → the harvest, or null while unknown. */
    private crateSource: Record<string, any> = {};
    /** The crate numbers typed for each harvest, e.g. "1-10, 15". */
    crateText: Record<string, string> = {};

    ngOnInit(): void {
        // Detail routes reuse this component when only the :id changes, so reload on every change.
        this.route.paramMap.subscribe(() => this.init());
    }

    async init(): Promise<void> {
        const id = this.param('id');
        this.isNew = !id;
        this.review = false;
        this.original = this.isNew ? null : await this.api.get<any>('Sale', 'Get', { id });
        const [buyers, sellable, settings] = await Promise.all([
            this.api.get<any[]>('Buyer', 'GetLookup'),
            this.api.get<any[]>('Sale', 'GetSellableLines', { saleId: this.original?.id }),
            this.api.get<any[]>('Sale', 'GetBaseAbwPricingSchemes'),
        ]);
        this.buyers = buyers.filter((b) => b.isActive || b.id === this.original?.buyerId);
        this.abwSchemes = settings ?? [];
        const keep = new Set((this.original?.lines ?? []).map((l: any) => l.priceTableId).filter((x: any) => x));
        this.tables = (await this.api.get<any[]>('PriceTable', 'GetAll')).filter((t) => t.isActive || keep.has(t.id));
        this.sellable = sellable;
        if (this.original) {
            const o = this.original;
            this.m = {
                id: o.id, buyerId: o.buyerId, saleDate: o.saleDate, dueDate: o.dueDate ?? '', paymentTerms: o.paymentTerms ?? '',
                lines: o.lines.map((l: any) => ({
                    harvestGradeLineId: l.harvestGradeLineId, kg: l.kg, buyerAcceptedKg: l.buyerAcceptedKg, pricePerKg: l.pricePerKg,
                    priceMethod: l.priceMethod ?? 1, basePricePerKg: l.basePricePerKg, baseAbwG: l.baseAbwG, stepPerG: l.stepPerG, priceAbwG: l.priceAbwG,
                    baseCountPerKg: l.baseCountPerKg, stepPerCount: l.stepPerCount, priceCountPerKg: l.priceCountPerKg, priceTableId: l.priceTableId ?? '',
                })),
            };
        } else {
            this.m = {
                buyerId: this.buyers[0]?.id ?? '', saleDate: this.today, dueDate: '', paymentTerms: '', paidNow: null, paidMethod: '', paidInFull: true,
                lines: this.sellable.length ? [this.blankLine(this.sellable[0].harvestGradeLineId)] : [],
                clientRequestId: newGuid(),
            };
            await this.startFromHarvest(this.query('harvestId'));
            // DEC-133: an unsaved sale on this device (connection lost, sign-in ended) comes back, with its request id.
            const draft = FormDrafts.load<any>(this.draftKey);
            this.restoredAt = null;
            if (draft?.data?.m) {
                this.m = { ...this.m, ...draft.data.m };
                this.crateText = { ...(draft.data.crateText ?? {}) };
                this.restoredAt = new Date(draft.savedAt).toISOString();
            }
        }
        this.crateSource = {};
        if (!this.restoredAt) {
            this.crateText = {};
        }
        const onSale: Record<string, number[]> = {};
        for (const c of this.original?.crates ?? []) {
            (onSale[c.harvestId] ??= []).push(c.crateNo);
        }
        for (const id of Object.keys(onSale)) {
            this.crateText[id] = formatCrateNos(onSale[id]);
        }
        await this.loadCrates();
        this.loading = false;
    }

    applySaleAbwScheme(schemeId: string): void {
        const scheme = this.abwSchemes.find((s) => s.id === schemeId);
        if (!scheme) return;
        for (const line of this.m.lines ?? []) {
            line.priceMethod = 2;
            this.copyAbwScheme(line, scheme);
            this.applyFormula(line);
        }
    }

    private copyAbwScheme(line: any, scheme: any): void {
        line.basePricePerKg = scheme.basePricePerKg;
        line.baseAbwG = scheme.baseAbwG;
        line.stepPerG = scheme.stepPerG;
        line.priceAbwG = null;
    }

    option(l: any): any {
        return this.sellable.find((o) => o.harvestGradeLineId === l.harvestGradeLineId);
    }

    /** Unsold kg of a grade line, not counting this sale's own kg (they are available again while editing). */
    unsold(o: any): number {
        return o ? o.unsoldKg : 0;
    }

    used(id: string, self: any): boolean {
        return this.m.lines.some((l: any) => l !== self && l.harvestGradeLineId === id);
    }

    gradeOver(l: any): boolean {
        const o = this.option(l);
        return !!o && Number(l.kg) > o.unsoldKg + 0.0005;
    }

    /** A disposition is harvest-wide, not grade-specific: all sale lines from that harvest share the remaining balance. */
    harvestOver(l: any): boolean {
        const o = this.option(l);
        if (!o) return false;
        const total = this.m.lines
            .filter((x: any) => this.option(x)?.harvestId === o.harvestId)
            .reduce((sum: number, x: any) => sum + (Number(x.kg) || 0), 0);
        return total > o.harvestAvailableKg + 0.0005;
    }

    over(l: any): boolean {
        return this.gradeOver(l) || this.harvestOver(l);
    }

    anyOver(): boolean {
        return this.m.lines.some((l: any) => this.over(l));
    }

    addLine(): void {
        const free = this.sellable.find((o) => !this.m.lines.some((l: any) => l.harvestGradeLineId === o.harvestGradeLineId));
        const line = this.blankLine(free?.harvestGradeLineId ?? '');
        if (this.m.abwSchemeId) {
            const scheme = this.abwSchemes.find((s) => s.id === this.m.abwSchemeId);
            if (scheme) {
                line.priceMethod = 2;
                this.copyAbwScheme(line, scheme);
            }
        }
        this.m.lines.push(line);
        if (line.priceMethod > 1) this.applyFormula(line);
        this.loadCrates();
    }

    onGrade(l: any): void {
        if (l.priceMethod > 1) {
            this.applyFormula(l);
        }
        this.loadCrates();
    }

    // ---- Crates for this buyer (DEC-86)

    /** The harvests this sale's lines sell from. */
    private lineHarvestIds(): string[] {
        return [...new Set<string>((this.m.lines ?? []).map((l: any) => this.option(l)?.harvestId).filter((id: any) => !!id))];
    }

    /** Loads the crate tally of each harvest on the sale, once. Without access to harvests the crates are left alone. */
    async loadCrates(): Promise<void> {
        if (!this.can('Farm.Harvests')) {
            return;
        }
        for (const id of this.lineHarvestIds()) {
            if (!(id in this.crateSource)) {
                this.crateSource[id] = null;
                try {
                    this.crateSource[id] = await this.api.get<any>('Harvest', 'Get', { id });
                } catch {
                    delete this.crateSource[id];
                }
            }
        }
    }

    /** The harvests on this sale that have a crate tally, in the order of the lines. */
    crateHarvests(): any[] {
        return this.lineHarvestIds().map((id) => this.crateSource[id]).filter((h) => h?.crates?.length);
    }

    /** Crates not on another sale: free ones and this sale's own. */
    freeCrates(h: any): any[] {
        return (h.crates ?? []).filter((c: any) => !c.saleId || c.saleId === this.original?.id);
    }

    crateError(h: any): string | null {
        const { nos, error } = parseCrateNos(this.crateText[h.id] ?? '');
        if (error) {
            return error;
        }
        for (const n of nos) {
            const crate = h.crates.find((c: any) => c.crateNo === n);
            if (!crate) {
                return `Crate ${n} is not on this harvest's tally (it has crates 1 to ${h.crates.length}).`;
            }
            if (crate.saleId && crate.saleId !== this.original?.id) {
                return `Crate ${n} is already on another sale.`;
            }
        }
        return null;
    }

    anyCrateError(): boolean {
        return this.crateHarvests().some((h) => !!this.crateError(h));
    }

    chosenCrates(h: any): any[] {
        const { nos, error } = parseCrateNos(this.crateText[h.id] ?? '');
        return error ? [] : h.crates.filter((c: any) => nos.includes(c.crateNo));
    }

    chosenKg(h: any): number {
        return crateKg(this.chosenCrates(h));
    }

    totalChosenCrates(): number {
        return this.crateHarvests().reduce((n, h) => n + this.chosenCrates(h).length, 0);
    }

    private linesOf(h: any): any[] {
        return (this.m.lines ?? []).filter((l: any) => this.option(l)?.harvestId === h.id);
    }

    lineKg(h: any): number {
        return this.linesOf(h).reduce((s: number, l: any) => s + (Number(l.kg) || 0), 0);
    }

    crateMismatch(h: any): boolean {
        return Math.abs(this.chosenKg(h) - this.lineKg(h)) >= 0.001;
    }

    takeAllCrates(h: any): void {
        this.crateText[h.id] = formatCrateNos(this.freeCrates(h).map((c: any) => c.crateNo));
    }

    /** " · 60/70" after a harvest in the line picker; nothing for an ungraded harvest on a farm that does not grade (DEC-100). */
    gradeText(o: any): string {
        return this.grading || (o.sizeLabel && o.sizeLabel !== 'Ungraded / mixed') ? ` · ${o.sizeLabel}` : '';
    }

    /** The size grade of a sale line, read from the harvest's grade lines. */
    private gradeOf(h: any, l: any): string | null {
        return (h.gradeLines ?? []).find((g: any) => g.id === l.harvestGradeLineId)?.sizeGradeId ?? null;
    }

    /**
     * The crates' kg for one line: all of them when the sale has one line from the harvest; with graded crates, the crates
     * of the line's grade (ungraded crates count for the grade no crate names). Null when it cannot be told.
     */
    private crateKgFor(h: any, l: any): number | null {
        const chosen = this.chosenCrates(h);
        if (this.linesOf(h).length === 1) {
            return crateKg(chosen);
        }
        if (!h.crates.some((c: any) => c.sizeGradeId)) {
            return null;
        }
        const grade = this.gradeOf(h, l);
        const named = new Set(h.crates.map((c: any) => c.sizeGradeId).filter((g: any) => !!g));
        return crateKg(chosen.filter((c: any) => (c.sizeGradeId ? c.sizeGradeId === grade : !named.has(grade))));
    }

    canUseCrateKg(h: any): boolean {
        return this.linesOf(h).every((l: any) => this.crateKgFor(h, l) !== null);
    }

    useCrateKg(h: any): void {
        for (const l of this.linesOf(h)) {
            const kg = this.crateKgFor(h, l);
            if (kg !== null && kg > 0) {
                l.kg = kg;
            }
        }
    }

    /**
     * The crates to send: every chosen crate, or null (leave the sale's crates as they are) when a harvest's tally could
     * not be read, so an edit never wipes crates this form could not show.
     */
    private cratesBody(): any[] | null {
        if (!this.can('Farm.Harvests') || this.lineHarvestIds().some((id) => !this.crateSource[id])) {
            return null;
        }
        return this.crateHarvests().flatMap((h) => this.chosenCrates(h).map((c: any) => ({ harvestId: h.id, crateNo: c.crateNo })));
    }

    /** "Sell this harvest": every unsold grade of the harvest, its buyer, and that buyer's last terms or price table. */
    private async startFromHarvest(harvestId: string | null): Promise<void> {
        const own = harvestId ? this.sellable.filter((o) => o.harvestId === harvestId && o.unsoldKg > 0) : [];
        if (!own.length) {
            return;
        }
        const gradeBalance = own.reduce((sum, o) => sum + o.unsoldKg, 0);
        const harvestAvailable = own[0].harvestAvailableKg;
        // Dispositions are harvest-wide, not grade-specific. Do not silently assign their kg to an arbitrary grade.
        const canPrefillAll = gradeBalance <= harvestAvailable + 0.0005;
        this.m.lines = own.map((o) => ({ ...this.blankLine(o.harvestGradeLineId), kg: canPrefillAll ? o.unsoldKg : null }));
        const buyerId = own[0].harvestBuyerId;
        if (buyerId && this.buyers.some((b) => b.id === buyerId && b.isActive)) {
            // The harvest's buyer is a useful starting point, but pricing is selected independently for each sale.
            this.m.buyerId = buyerId;
        }
    }

    private blankLine(harvestGradeLineId: string): any {
        return {
            harvestGradeLineId, kg: null, buyerAcceptedKg: null, pricePerKg: null, priceMethod: 1,
            basePricePerKg: null, baseAbwG: null, stepPerG: null, priceAbwG: null, baseCountPerKg: null, stepPerCount: null, priceCountPerKg: null, priceTableId: '',
        };
    }

    /** Pricing terms are chosen for this sale; no buyer's previous pricing is copied. */
    async onMethod(l: any): Promise<void> {
        if (l.priceMethod === 2 && this.m.abwSchemeId) {
            const scheme = this.abwSchemes.find((s) => s.id === this.m.abwSchemeId);
            if (scheme) this.copyAbwScheme(l, scheme);
        }
        this.applyFormula(l);
    }

    /** Tables for a line: the buyer's own first, then tables for any buyer; another buyer's table only if already chosen. */
    tablesFor(l: any): any[] {
        return this.tables
            .filter((t) => !t.buyerId || t.buyerId === this.m.buyerId || t.id === l.priceTableId)
            .sort((a, b) => Number(b.buyerId === this.m.buyerId) - Number(a.buyerId === this.m.buyerId));
    }

    /** The count a count-based price starts from: the grade's middle count, else from the harvest's ABW. */
    defaultCount(l: any): number | null {
        const o = this.option(l);
        return o?.defaultCountPerKg ?? countFromAbw(o?.harvestAbwG ?? null);
    }

    /** The method's price; null until every term is filled (and for Fixed). Matches the server's SaleLine helpers. */
    formula(l: any): number | null {
        return referencePrice(l, usedAbw(l, this.option(l)?.harvestAbwG ?? null), usedCount(l, this.defaultCount(l)), this.tablesFor(l));
    }

    applyFormula(l: any): void {
        const p = this.formula(l);
        if (p !== null && p >= 0) {
            l.pricePerKg = p;
        }
    }

    private num(v: any): number | null {
        return v === '' || v == null ? null : Number(v);
    }

    amount(l: any): number {
        const kg = this.num(l.buyerAcceptedKg) ?? (Number(l.kg) || 0);
        return Math.round(kg * (Number(l.pricePerKg) || 0) * 100) / 100;
    }

    diffPct(l: any): number {
        const b = this.num(l.buyerAcceptedKg);
        return b == null || !(l.kg > 0) ? 0 : (Math.abs(b - l.kg) / l.kg) * 100;
    }

    validLines(): any[] {
        return (this.m.lines ?? []).filter((l: any) => l.harvestGradeLineId && l.kg > 0 && l.pricePerKg !== null && l.pricePerKg !== '' && l.pricePerKg >= 0);
    }

    totalKg(): number {
        return (this.m.lines ?? []).reduce((s: number, l: any) => s + (Number(l.kg) || 0), 0);
    }

    total(): number {
        return (this.m.lines ?? []).reduce((s: number, l: any) => s + this.amount(l), 0);
    }

    buyerName(): string {
        return this.buyers.find((b) => b.id === this.m.buyerId)?.name ?? '';
    }

    private get draftKey(): string {
        return `sale.${this.query('harvestId') ?? 'new'}`;
    }

    keepDraft(): void {
        if (this.isNew && !this.loading) {
            FormDrafts.save(this.draftKey, { m: this.m, crateText: this.crateText });
        }
    }

    discardDraft(): void {
        FormDrafts.clear(this.draftKey);
        this.restoredAt = null;
        void this.init();
    }

    async save(): Promise<void> {
        const body: any = {
            id: this.m.id,
            clientRequestId: this.isNew ? (this.m.clientRequestId ??= newGuid()) : null,
            rowVersion: this.isNew ? null : this.original?.rowVersion, buyerId: this.m.buyerId, saleDate: this.m.saleDate, dueDate: this.m.dueDate || null, paymentTerms: this.m.paymentTerms,
            lines: this.validLines().map((l: any) => ({
                harvestGradeLineId: l.harvestGradeLineId, kg: Number(l.kg), buyerAcceptedKg: this.num(l.buyerAcceptedKg), pricePerKg: Number(l.pricePerKg),
                ...pricingBody(l),
            })),
            crates: this.cratesBody(),
        };
        const paid = this.isNew ? initialPaymentOf(this.m, this.total(), this.m.saleDate) : null;
        if (paid) {
            body.initialPayment = paid;
        }
        let sale: any;
        const ok = await this.act(async () => (sale = this.isNew ? await this.api.post<any>('Sale', 'Create', body) : await this.api.put<any>('Sale', 'Update', body)));
        if (ok) {
            if (this.isNew) {
                FormDrafts.clear(this.draftKey);
            }
            this.notifySaved(this.isNew ? `Sale saved as ${sale.dispatchReceiptNo}.` : 'Sale saved.');
            if (sale?.warnings?.length) {
                this.showWarnings(sale.warnings);
            }
            this.router.navigate(['/app/sales', sale.id], { replaceUrl: true });
        }
    }
}
