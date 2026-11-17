import { Component, ChangeDetectionStrategy, Injector, Type, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FpmsApiService } from '@shared/fpms/api.service';
import { FarmTime } from '@shared/fpms/farm-time';
import { FeedingSessions, LogTypes, NewLogTypes } from '@shared/fpms/labels';
import { logSummary } from '@shared/fpms/log-summary';
import { EMBEDDED_QUERY, LogDrawerRequest, LogDrawerService } from '@shared/fpms/log-drawer.service';
import { FeedbackService } from '@shared/fpms/feedback';

type Kind = 'feeding' | 'log';

/** An icon per kind of entry for the Record operations tiles; the words carry the meaning, the icon helps scanning. */
const LOG_TYPE_ICONS: Record<number, string> = {
    4: 'fa-tint',
    5: 'fa-ruler-horizontal',
    6: 'fa-flask',
    7: 'fa-heart-broken',
    9: 'fa-sticky-note',
    10: 'fa-water',
};

const NEW_LOG_TYPES = NewLogTypes.map((value) => ({
    value,
    label: (LogTypes as Record<number, string>)[value],
    icon: LOG_TYPE_ICONS[value] ?? 'fa-pen',
}));

interface DayView {
    feeding: { session: string; text: string }[];
    logs: { id: string; logType: number; type: string; time: string; summary: string; canEdit: boolean; canVoid: boolean }[];
}

/** One line of the day's checklist (DEC-125): a kind of record, whether it is in, and what is in. */
interface CheckRow {
    key: string;
    label: string;
    kind: Kind;
    logType: number | null;
    done: boolean;
    detail: string;
    entries: DayView['logs'];
}

/**
 * The logging wizard: a centered dialog over the current page, so a batch, pond or cycle page need not be left to log.
 * It is always for one pond and one day. Step 1 asks which pond (skipped when the page already knows it); step 2 is one
 * page: what is already logged that day, the buttons for what to record, and the chosen Feeding or Record operations
 * form opening below them. A save shows up in the day's list at once. Opened from page-header buttons and calendar
 * squares; the Dashboard links to the Operations pages instead.
 */
@Component({
    selector: 'fpms-log-drawer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet, FormsModule],
    template: `
        @if (request(); as r) {
            <div class="fpms-dialog-backdrop no-print">
                <div class="fpms-dialog" role="dialog" aria-modal="true" aria-labelledby="lw-h">
                    <div class="fpms-dialog-head">
                        <div class="flex-fill">
                            <h2 id="lw-h">{{ stage() === 'work' && pondLabel() ? 'Record for ' + pondLabel() : 'Record operations' }}</h2>
                            <p class="text-muted mb-0">
                                {{ stage() === 'pond' ? 'Logging is recorded for one pond at a time.' : 'Pick what to record; its form opens below.' }}
                            </p>
                        </div>
                        <button type="button" class="fpms-dialog-close" (click)="close()" aria-label="Close" title="Close">
                            &times;
                        </button>
                    </div>
                    <div class="fpms-dialog-body">
                        @if (stage() === 'pond') {
                            <div class="form-group mb-0">
                                <label for="lw-pond">Which pond? <span class="text-danger">*</span></label>
                                <select id="lw-pond" class="form-control" [ngModel]="batchId()" (ngModelChange)="batchId.set($event)">
                                    @for (b of batches(); track b.id) {
                                        <option [ngValue]="b.id">{{ b.pondCode }} · {{ b.batchCode }}{{ b.isMine ? ' (yours)' : b.lookingAfterName ? ' · ' + b.lookingAfterName : '' }}</option>
                                    }
                                </select>
                                @if (!batches().length) {
                                    <small class="form-text text-muted">No pond has an open batch yet.</small>
                                }
                            </div>
                        } @else {
                            <!-- What is already logged on this day, as small chips (DEC-96). -->
                            <div class="fpms-lw-so-far">
                                <div class="fpms-lw-so-far-head">
                                    <h3 class="fpms-lw-h">{{ isToday() ? 'Today so far' : 'This day' }}</h3>
                                    <label for="lw-date" class="mb-0 ml-auto mr-2">Day</label>
                                    <input
                                        id="lw-date"
                                        type="date"
                                        class="form-control w-auto"
                                        [max]="todayValue"
                                        [ngModel]="dateValue()"
                                        (ngModelChange)="changeDate($event)" />
                                </div>
                                @if (day() === null) {
                                    <span class="text-muted">Loading…</span>
                                } @else {
                                    <!-- The day as a checklist (DEC-125): each kind of record, in or not yet, with Record or Correct beside it. -->
                                    <ul class="fpms-lw-check">
                                        @for (r of checklist(); track r.key) {
                                            <li [class.is-done]="r.done">
                                                <i class="fas" [class.fa-check-circle]="r.done" [class.fa-circle]="!r.done" aria-hidden="true"></i>
                                                <div class="fpms-lw-check-what">
                                                    <strong>{{ r.label }}</strong>
                                                    <span class="sr-only">{{ r.done ? ': recorded' : ': not recorded' }}</span>
                                                    @if (r.detail) { <div class="text-muted">{{ r.detail }}</div> }
                                                    @for (l of r.entries; track l.id) {
                                                        <div class="fpms-lw-check-entry">
                                                            <span><span class="text-muted">{{ l.time }}</span> {{ l.summary }}</span>
                                                            <button type="button" class="btn btn-sm btn-link px-1" (click)="openEntry(l)">{{ l.canEdit ? 'Correct' : 'View' }}</button>
                                                        </div>
                                                    }
                                                </div>
                                                <button type="button" class="btn btn-sm" [class.btn-outline-primary]="!r.done" [class.btn-outline-secondary]="r.done" (click)="pick(r.kind, r.logType)" [attr.aria-label]="(r.done && r.kind !== 'feeding' ? 'Record another ' : r.kind === 'feeding' && r.done ? 'Open feeding for ' : 'Record ') + r.label.toLowerCase()">
                                                    {{ r.kind === 'feeding' ? (r.done ? 'Open' : 'Record') : r.done ? 'Add' : 'Record' }}
                                                </button>
                                            </li>
                                        }
                                    </ul>
                                }
                            </div>
                            <h3 class="fpms-lw-h">What do you want to record?</h3>
                            <div class="fpms-lw-tiles" role="radiogroup" aria-label="Record type">
                                <button
                                    type="button"
                                    class="fpms-lw-tile"
                                    role="radio"
                                    [attr.aria-checked]="selected() === 'feeding'"
                                    (click)="pick('feeding', null)">
                                    <i class="fas fa-utensils" aria-hidden="true"></i>
                                    Feeding
                                </button>
                                @for (o of logTypes; track o.value) {
                                    <button
                                        type="button"
                                        class="fpms-lw-tile"
                                        role="radio"
                                        [attr.aria-checked]="selected() === o.value"
                                        (click)="pick('log', o.value)">
                                        <i [class]="'fas ' + o.icon" aria-hidden="true"></i>
                                        {{ o.label }}
                                    </button>
                                }
                            </div>
                            @if (view(); as v) {
                                <div id="lw-form" class="border-top pt-3">
                                    <ng-container *ngComponentOutlet="v.type; injector: v.injector"></ng-container>
                                </div>
                            }
                        }
                    </div>
                    @if (stage() === 'pond' || !startedWithPond()) {
                        <div class="fpms-dialog-foot">
                            @if (stage() === 'work') {
                                <button type="button" class="btn btn-default mr-auto" (click)="changePond()">Change pond</button>
                            } @else {
                                <button type="button" class="btn btn-default" (click)="close()">Cancel</button>
                                <button type="button" class="btn btn-primary" [disabled]="!batchId()" (click)="start()">Next</button>
                            }
                        </div>
                    }
                </div>
            </div>
        }
    `,
})
export class LogDrawerComponent {
    private router = inject(Router);
    private injector = inject(Injector);
    private api = inject(FpmsApiService);
    private drawer = inject(LogDrawerService);
    private feedback = inject(FeedbackService);

    readonly request = this.drawer.request;
    readonly stage = signal<'pond' | 'work'>('pond');
    readonly startedWithPond = signal(false);
    readonly batchId = signal<string | null>(null);
    readonly batches = signal<any[]>([]);
    readonly logTypes = NEW_LOG_TYPES;

    /** The chosen form: 'feeding' or a log type number. */
    readonly selected = signal<'feeding' | number | null>(null);
    readonly view = signal<{ type: Type<unknown>; injector: Injector } | null>(null);

    /** What is already logged for the pond on the day: the two feeding sessions, then every other entry. */
    readonly day = signal<DayView | null>(null);

    constructor() {
        this.router.events
            .pipe(
                filter((e): e is NavigationEnd => e instanceof NavigationEnd),
                takeUntilDestroyed()
            )
            .subscribe(() => this.drawer.close());
        effect(() => {
            const request = this.drawer.request();
            untracked(() => void this.begin(request));
        });
        let first = true;
        effect(() => {
            this.drawer.saved();
            if (first) {
                first = false;
                return;
            }
            // A save in the form below: show it in the list above.
            untracked(() => void this.loadDay());
        });
    }

    readonly todayValue = FarmTime.today();

    /** The day being logged: the square's day, or today. Changed with the date field. */
    readonly dateValue = signal<string>(FarmTime.today());

    date(): string {
        return this.dateValue();
    }

    /** Moves the wizard to another day: the list reloads and the open form restarts on that day. */
    async changeDate(value: string): Promise<void> {
        const previous = this.dateValue();
        if (!value || value > this.todayValue || value === previous) {
            return;
        }
        if (!(await this.confirmDiscard())) {
            // Put the field back to the day still shown.
            this.dateValue.set('');
            await Promise.resolve();
            this.dateValue.set(previous);
            return;
        }
        this.dateValue.set(value);
        this.day.set(null);
        void this.loadDay();
        const sel = this.selected();
        if (sel !== null && this.view()) {
            await this.show({ kind: sel === 'feeding' ? 'feeding' : 'log', batchId: this.batchId(), logType: sel === 'feeding' ? null : sel, date: value });
        }
    }

    isToday(): boolean {
        return this.date() === FarmTime.today();
    }

    /** The pond being logged: from the pond list when it was picked here, else looked up for the page that opened the wizard. */
    readonly pond = signal('');

    pondLabel(): string {
        const b = this.batches().find((x) => x.id === this.batchId());
        return b ? `${b.pondCode} · ${b.batchCode}` : this.pond();
    }

    private async loadPond(batchId: string): Promise<void> {
        try {
            const b = await this.api.get<any>('Batch', 'Get', { id: batchId });
            if (this.batchId() === batchId && b) {
                this.pond.set(`${b.pondCode} · ${b.batchCode}`);
            }
        } catch {
            /* the title falls back to "Record operations" */
        }
    }

    close(): void {
        void this.confirmDiscard().then((ok) => ok && this.drawer.close());
    }

    /** True when nothing typed would be lost, or the user agrees to lose it. */
    private confirmDiscard(): Promise<boolean> {
        if (!this.drawer.embeddedPage?.hasUnsavedInput()) {
            return Promise.resolve(true);
        }
        return this.feedback.review({
            title: 'Discard this entry?',
            message: 'The entry you started is not saved and will be discarded.',
            confirmText: 'Discard entry',
            cancelText: 'Keep editing',
            danger: true,
        });
    }

    start(): void {
        this.stage.set('work');
        void this.loadDay();
    }

    async changePond(): Promise<void> {
        if (!(await this.confirmDiscard())) {
            return;
        }
        this.view.set(null);
        this.selected.set(null);
        this.day.set(null);
        this.stage.set('pond');
    }

    /**
     * The day as a checklist (DEC-125): feeding, then each kind of entry, each marked in or not yet. Water quality and
     * feeding are expected every day; the others are listed so the person sees at a glance what is and is not in.
     */
    checklist(): CheckRow[] {
        const d = this.day();
        if (!d) {
            return [];
        }
        const fed = d.feeding.filter((f) => f.session !== 'Feeding');
        const rows: CheckRow[] = [
            { key: 'feeding', label: 'Feeding', kind: 'feeding', logType: null, done: fed.length > 0, detail: fed.length ? fed.map((f) => `${f.session}: ${f.text}`).join(' · ') : 'None recorded', entries: [] },
        ];
        for (const t of this.logTypes) {
            const entries = d.logs.filter((l) => l.logType === t.value);
            rows.push({ key: 'log' + t.value, label: t.label, kind: 'log', logType: t.value, done: entries.length > 0, detail: entries.length ? '' : 'None recorded', entries });
        }
        return rows;
    }

    /** Opens a recorded entry below, to correct it (or to read it when the person cannot change it). */
    async openEntry(l: DayView['logs'][number]): Promise<void> {
        if (!(await this.confirmDiscard())) {
            return;
        }
        this.selected.set(l.logType);
        await this.show({ kind: 'log', batchId: this.batchId(), logType: l.logType, date: this.dateValue(), logId: l.id });
        setTimeout(() => document.getElementById('lw-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    /** Opens the chosen form for the pond and day, below the buttons. */
    async pick(kind: Kind, logType: number | null): Promise<void> {
        const selected = kind === 'feeding' ? 'feeding' : logType;
        if (this.selected() === selected && this.view()) {
            return;
        }
        if (!(await this.confirmDiscard())) {
            return;
        }
        this.selected.set(selected);
        await this.show({ kind, batchId: this.batchId(), logType, date: this.dateValue() });
        setTimeout(() => document.getElementById('lw-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    private async begin(request: LogDrawerRequest | null): Promise<void> {
        this.view.set(null);
        this.selected.set(null);
        this.day.set(null);
        if (!request) {
            return;
        }
        this.batchId.set(request.batchId ?? null);
        this.dateValue.set(request.date && request.date <= this.todayValue ? request.date : this.todayValue);
        this.startedWithPond.set(!!request.batchId);
        this.pond.set('');
        if (request.batchId) {
            this.stage.set('work');
            void this.loadPond(request.batchId);
            void this.loadDay();
            if (request.kind === 'log' && request.logId) {
                this.selected.set(request.logType ?? null);
                await this.show(request);
            } else if (request.kind) {
                await this.pick(request.kind, request.logType ?? null);
            }
            return;
        }
        this.stage.set('pond');
        const batches = await this.api.get<any[]>('Batch', 'GetAll', { openOnly: true });
        // DEC-127: the pond the person looks after comes first and is chosen; another is one pick away.
        this.batches.set(batches.sort((x, y) => Number(!!y.isMine) - Number(!!x.isMine) || String(x.pondCode).localeCompare(String(y.pondCode), undefined, { numeric: true })));
        this.batchId.set(this.batches()[0]?.id ?? null);
    }

    private async loadDay(): Promise<void> {
        const batchId = this.batchId();
        const date = this.date();
        if (!batchId) {
            return;
        }
        const [sessions, logs] = await Promise.all([
            this.api.get<any>('Feeding', 'GetList', { batchId, from: date, to: date, maxResultCount: 10 }),
            this.api.get<any>('Log', 'GetList', { batchId, from: date, to: date, maxResultCount: 50 }),
        ]);
        if (this.batchId() !== batchId || this.date() !== date) {
            return;
        }
        // DEC-61: the day's feedings in order; a day with none says so once.
        const recorded = [...(sessions.items as any[])].sort((x, y) => x.session - y.session);
        const feeding = recorded.length
            ? recorded.map((f) => ({
                  session: (FeedingSessions as Record<number, string>)[f.session] ?? `Feeding ${f.session}`,
                  text: f.status === 2 ? 'not fed' : `${f.kg} kg${f.fedAtTime ? ' at ' + f.fedAtTime : ''}`,
              }))
            : [{ session: 'Feeding', text: 'not recorded' }];
        this.day.set({
            feeding,
            logs: (logs.items as any[])
                .filter((l) => !l.isVoided)
                .map((l) => ({
                    id: l.id,
                    logType: l.logType,
                    type: (LogTypes as Record<number, string>)[l.logType] ?? '',
                    time: FarmTime.time(l.observedAtUtc),
                    summary: logSummary(l) || (l.notes ?? ''),
                    canEdit: !!l.canEdit,
                    canVoid: !!l.canVoid,
                })),
        });
    }

    private async show(request: LogDrawerRequest): Promise<void> {
        const query: Record<string, string | null> = {
            batchId: request.batchId ?? null,
            date: request.date ?? null,
            logType: request.logType != null ? String(request.logType) : null,
            logId: request.logId ?? null,
            focus: request.focus ?? null,
        };
        const injector = Injector.create({ providers: [{ provide: EMBEDDED_QUERY, useValue: query }], parent: this.injector });
        const type =
            request.kind === 'feeding'
                ? (await import('../fpms/logbook/feeding-sheet.component')).FeedingSheetComponent
                : (await import('../fpms/logbook/log-entry.component')).LogEntryComponent;
        this.view.set({ type, injector });
    }
}
