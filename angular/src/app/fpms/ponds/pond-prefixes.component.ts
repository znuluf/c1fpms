import { Component, OnInit, signal } from '@angular/core';
import { FpmsPage } from '@shared/fpms/fpms-page';
import { FPMS_IMPORTS } from '../shared-imports';

/** Pond name prefixes (spec Section 5, DEC-20): the farm's list that pond names and codes are built from. */
@Component({
    standalone: true,
    imports: FPMS_IMPORTS,
    template: `
        <fpms-page-header title="Pond name prefixes" subtitle="A pond's name is a prefix and a number (Grow-out Pond 3); its code uses the short code (GP-03)." backLink="/app/ponds" backLabel="Ponds">
            @if (canManage && !adding && !editingId) {
                <button type="button" class="fpms-button fpms-button-primary" (click)="startAdd()"><i class="fas fa-plus fpms-icon-gap" aria-hidden="true"></i>Add a prefix</button>
            }
        </fpms-page-header>
        <section class="fpms-page">
            <div class="fpms-page-inner fpms-narrow">
                @if (adding) {
                    <!-- One form at a time (DEC-96): name, an optional short code, and what the ponds will be called. -->
                    <form class="fpms-panel" #af="ngForm" (ngSubmit)="create()" fpmsReview="prefix" [fpmsReviewNew]="true" novalidate>
                        <div class="fpms-panel-head"><h2 class="fpms-panel-title">Add a prefix</h2></div>
                        <div class="fpms-panel-body">
                            <div class="fpms-grid-row">
                                <div class="fpms-field fpms-col-md-7">
                                    <label for="pn">Name <span class="fpms-danger">*</span></label>
                                    <input id="pn" class="fpms-control" name="name" [(ngModel)]="draft.name" required maxlength="60" placeholder="e.g. Settling Pond" />
                                </div>
                                <div class="fpms-field fpms-col-md-5">
                                    <label for="sc">Short code</label>
                                    <input id="sc" class="fpms-control fpms-uppercase" name="shortCode" [(ngModel)]="draft.shortCode" maxlength="6" pattern="[A-Za-z]{1,6}" [placeholder]="suggested || 'e.g. SP'" />
                                    <small class="fpms-help fpms-muted">1 to 6 letters. Left empty, the initials are used. It cannot be changed later.</small>
                                </div>
                            </div>
                            @if (draft.name?.trim()) {
                                <p class="fpms-prefix-preview fpms-no-bottom">
                                    <i class="fas fa-eye fpms-icon-gap" aria-hidden="true"></i>
                                    New ponds will read <strong>{{ draft.name.trim() }} 1</strong>, coded <strong>{{ example((draft.shortCode || suggested).toUpperCase(), 1) }}</strong>.
                                </p>
                            }
                        </div>
                        <div class="fpms-panel-foot fpms-flex fpms-wrap fpms-align-center-items">
                            <button type="submit" class="fpms-button fpms-button-primary fpms-icon-gap" [disabled]="busy() || !af.form.valid">Save prefix</button>
                            <button type="button" class="fpms-button fpms-button-secondary fpms-space-end-3" (click)="adding = false">Cancel</button>
                            <fpms-form-hint [form]="af"></fpms-form-hint>
                        </div>
                    </form>
                }

                <div class="fpms-panel">
                    @if (!prefixes()) {
                        <fpms-loading></fpms-loading>
                    } @else {
                        <ul class="fpms-prefix-list" aria-label="Pond name prefixes">
                            @for (x of sorted(); track x.id; let i = $index; let last = $last) {
                                <li [class.is-hidden]="!x.isActive">
                                    @if (editingId === x.id) {
                                        <form class="fpms-prefix-edit" #ef="ngForm" (ngSubmit)="saveEdit(x)" fpmsReview="prefix" novalidate>
                                            <div class="fpms-grid-row fpms-align-end-items">
                                                <div class="fpms-field fpms-col-md-6 fpms-space-bottom-2">
                                                    <label [for]="'en' + x.id">Name</label>
                                                    <input [id]="'en' + x.id" class="fpms-control" name="name" [(ngModel)]="edit.name" required maxlength="60" />
                                                </div>
                                                <div class="fpms-field fpms-col-md-6 fpms-space-bottom-2">
                                                    <div class="fpms-check fpms-check-box">
                                                        <input type="checkbox" class="fpms-check-input" [id]="'ea' + x.id" name="isActive" [(ngModel)]="edit.isActive" />
                                                        <label class="fpms-check-label" [for]="'ea' + x.id">Offer it when adding a pond</label>
                                                    </div>
                                                </div>
                                            </div>
                                            <p class="fpms-small fpms-muted fpms-space-bottom-2">The code {{ x.shortCode }} stays. Renaming changes how pond names read ("{{ edit.name || x.name }} {{ x.nextNumber }}"); codes never change. Hidden prefixes stay on the ponds that have them.</p>
                                            <button type="submit" class="fpms-button fpms-button-primary fpms-button-compact fpms-icon-gap" [disabled]="busy() || !ef.form.valid">Save</button>
                                            <button type="button" class="fpms-button fpms-button-secondary fpms-button-compact" (click)="editingId = null">Cancel</button>
                                        </form>
                                    } @else {
                                        <div class="fpms-prefix-main">
                                            <div class="fpms-prefix-name">
                                                {{ x.name }} <code class="fpms-prefix-code">{{ x.shortCode }}</code>
                                                @if (!x.isActive) { <span class="fpms-label fpms-label-secondary fpms-icon-gap">Hidden when adding a pond</span> }
                                            </div>
                                            <div class="fpms-prefix-sub">
                                                {{ x.pondCount }} {{ x.pondCount === 1 ? 'pond' : 'ponds' }} · next: {{ x.name }} {{ x.nextNumber }} ({{ example(x.shortCode, x.nextNumber) }})
                                            </div>
                                        </div>
                                        @if (canManage) {
                                            <div class="fpms-prefix-actions">
                                                <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy() || i === 0" (click)="move(i, -1)" [attr.aria-label]="'Move ' + x.name + ' up'" title="Move up"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
                                                <button type="button" class="fpms-button fpms-button-compact fpms-button-secondary" [disabled]="busy() || last" (click)="move(i, 1)" [attr.aria-label]="'Move ' + x.name + ' down'" title="Move down"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
                                                <button type="button" class="fpms-button fpms-button-compact fpms-button-outline" [disabled]="busy() || adding" (click)="startEdit(x)">Edit</button>
                                            </div>
                                        }
                                    }
                                </li>
                            } @empty {
                                <li><fpms-empty text="No prefixes yet. Add the first, e.g. Grow-out Pond." icon="fas fa-tag"></fpms-empty></li>
                            }
                        </ul>
                    }
                </div>
                <p class="fpms-small fpms-muted">The order here is the order of the prefix list when adding a pond.</p>
            </div>
        </section>
    `,
})
export class PondPrefixesComponent extends FpmsPage implements OnInit {
    prefixes = signal<any[] | null>(null);
    draft: any = { name: '', shortCode: '' };
    adding = false;
    editingId: string | null = null;
    edit: any = {};

    sorted(): any[] {
        return [...(this.prefixes() ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name)));
    }

    startAdd(): void {
        this.draft = { name: '', shortCode: '' };
        this.adding = true;
        this.editingId = null;
    }

    startEdit(x: any): void {
        this.edit = { name: x.name, isActive: x.isActive };
        this.editingId = x.id;
    }

    async saveEdit(x: any): Promise<void> {
        if (await this.act(() => this.api.put('Pond', 'UpdatePrefix', { ...x, name: this.edit.name, isActive: this.edit.isActive }))) {
            this.notifySaved('Prefix saved.');
            this.editingId = null;
            await this.load();
        }
    }

    /** Moves a prefix one place up or down; the list is renumbered 10, 20, 30… so the order stays unambiguous. */
    async move(index: number, step: number): Promise<void> {
        const list = this.sorted();
        const target = index + step;
        if (target < 0 || target >= list.length) {
            return;
        }
        [list[index], list[target]] = [list[target], list[index]];
        const changed = list.map((x, i) => ({ x, order: (i + 1) * 10 })).filter(({ x, order }) => x.sortOrder !== order);
        const ok = await this.act(async () => {
            for (const { x, order } of changed) {
                await this.api.put('Pond', 'UpdatePrefix', { ...x, sortOrder: order });
            }
        });
        if (ok) {
            await this.load();
        }
    }

    get canManage(): boolean {
        return this.can('Farm.Ponds.Manage');
    }

    /** Same rule as the API: initials of the words in the name. */
    get suggested(): string {
        return (this.draft.name ?? '')
            .split(/\s+/)
            .map((w: string) => (w.match(/[A-Za-z]/) ?? [''])[0])
            .join('')
            .toUpperCase()
            .slice(0, 6);
    }

    example(shortCode: string, n: number): string {
        return `${shortCode}-${String(n).padStart(2, '0')}`;
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        this.prefixes.set(await this.api.get<any[]>('Pond', 'GetPrefixes'));
    }

    async create(): Promise<void> {
        if (await this.act(() => this.api.post('Pond', 'CreatePrefix', { name: this.draft.name, shortCode: this.draft.shortCode || null }))) {
            this.notifySaved('Prefix saved.');
            this.draft = { name: '', shortCode: '' };
            this.adding = false;
            await this.load();
        }
    }
}
