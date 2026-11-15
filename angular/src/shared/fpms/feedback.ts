import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    Directive,
    ElementRef,
    Injectable,
    Input,
    OnDestroy,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FarmTime } from './farm-time';

/**
 * Feedback when saving (DEC-116): a review before a save, change or removal, and a short "Saved" note after it.
 * One service, two hosts placed once in the app shell, and a directive for forms. Pages reach it through FpmsPage
 * (confirm, notifySaved) or by putting fpmsReview on a <form>.
 */

/** One line of a review: a field and its value, or its old and new value. */
export interface ReviewRow {
    label: string;
    before?: string;
    after: string;
    /** A warning the form showed for this field ("Out of range (4–9 mg/L)"). */
    note?: string;
}

export interface ReviewRequest {
    title: string;
    /** A sentence above the rows: what happens, what it affects. */
    message?: string;
    rows?: ReviewRow[];
    /** Changed fields beyond the ones listed. */
    moreCount?: number;
    /** The button that goes ahead, in the same words as the action ("Save delivery", "Archive"). */
    confirmText: string;
    cancelText?: string;
    /** A removal or anything that cannot be undone from this screen: the button is red. */
    danger?: boolean;
}

export interface Toast {
    id: number;
    text: string;
    detail?: string;
    tone: 'success' | 'info';
    actionText?: string;
    action?: () => unknown;
}

/** Whether new records are reviewed too, or only changes and removals. Kept per device (My account). */
export type ReviewMode = 'all' | 'changes';
const REVIEW_KEY = 'fpms.review';

export function savedReviewMode(): ReviewMode {
    try {
        return localStorage.getItem(REVIEW_KEY) === 'changes' ? 'changes' : 'all';
    } catch {
        return 'all';
    }
}

export function saveReviewMode(mode: ReviewMode): void {
    try {
        localStorage.setItem(REVIEW_KEY, mode);
    } catch {
        // Storage can be blocked; the choice then lasts until the page is reloaded.
    }
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
    readonly review$ = signal<(ReviewRequest & { resolve: (ok: boolean) => void }) | null>(null);
    readonly toasts = signal<Toast[]>([]);
    reviewMode: ReviewMode = savedReviewMode();
    /** What the last reviewed form saved, as shown in its review; a page can show it again after saving. */
    lastRows: ReviewRow[] = [];
    private next = 1;

    /** Shows the review; true when the person goes ahead. A second request while one is open declines the first. */
    review(request: ReviewRequest): Promise<boolean> {
        this.review$()?.resolve(false);
        return new Promise((resolve) => this.review$.set({ ...request, resolve }));
    }

    close(ok: boolean): void {
        const r = this.review$();
        this.review$.set(null);
        r?.resolve(ok);
    }

    /** A short note in the corner. With an action (Undo) it stays longer. */
    toast(t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }): void {
        const toast: Toast = { tone: 'success', ...t, id: this.next++ };
        this.toasts.set([...this.toasts(), toast].slice(-3));
        setTimeout(() => this.dismiss(toast.id), toast.action ? 10000 : 6000);
    }

    dismiss(id: number): void {
        this.toasts.set(this.toasts().filter((t) => t.id !== id));
    }
}

/** The review dialog. Placed once in the app shell. */
@Component({
    selector: 'fpms-review-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (fb.review$(); as r) {
            <div class="fpms-dialog-backdrop fpms-review-backdrop" (click)="fb.close(false)">
                <div
                    class="fpms-dialog fpms-dialog-sm fpms-review"
                    [class.fpms-review-danger]="r.danger"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="fpms-review-h"
                    [attr.aria-describedby]="r.message ? 'fpms-review-m' : null"
                    (click)="$event.stopPropagation()"
                    (keydown.escape)="fb.close(false)">
                    <div class="fpms-dialog-head">
                        <h2 id="fpms-review-h" class="mr-auto">
                            @if (r.danger) { <i class="fas fa-exclamation-triangle mr-2" aria-hidden="true"></i> }
                            {{ r.title }}
                        </h2>
                    </div>
                    <div class="fpms-dialog-body">
                        @if (r.message) { <p id="fpms-review-m" class="fpms-review-message">{{ r.message }}</p> }
                        @if (r.rows?.length) {
                            <dl class="fpms-review-rows">
                                @for (row of r.rows; track $index) {
                                    <div>
                                        <dt>{{ row.label }}</dt>
                                        <dd>
                                            @if (row.before !== undefined) {
                                                <span class="fpms-review-before"><span class="sr-only">was </span>{{ row.before }}</span>
                                                <i class="fas fa-arrow-right mx-2" aria-hidden="true"></i><span class="sr-only">, now </span>
                                            }
                                            <span class="fpms-review-after">{{ row.after }}</span>
                                            @if (row.note) { <div class="fpms-review-note"><i class="fas fa-exclamation-triangle mr-1" aria-hidden="true"></i>{{ row.note }}</div> }
                                        </dd>
                                    </div>
                                }
                            </dl>
                            @if (r.moreCount) { <p class="text-muted mb-0 mt-2">And {{ r.moreCount }} more {{ r.moreCount === 1 ? 'field' : 'fields' }}.</p> }
                        }
                    </div>
                    <div class="fpms-dialog-foot">
                        <button type="button" class="btn btn-default" (click)="fb.close(false)">{{ r.cancelText || 'Back' }}</button>
                        <button #go type="button" class="btn" [class.btn-primary]="!r.danger" [class.btn-danger]="r.danger" (click)="fb.close(true)">{{ r.confirmText }}</button>
                    </div>
                </div>
            </div>
        }
    `,
})
export class ReviewHostComponent {
    readonly fb = inject(FeedbackService);
    private readonly go = viewChild<ElementRef<HTMLButtonElement>>('go');
    private returnTo: HTMLElement | null = null;

    constructor() {
        // Focus the button that goes ahead (Enter confirms); give focus back to where it was when the review closes.
        effect(() => {
            const open = !!this.fb.review$();
            const button = this.go();
            if (open && button) {
                this.returnTo ??= document.activeElement as HTMLElement | null;
                button.nativeElement.focus();
            } else if (!open && this.returnTo) {
                const back = this.returnTo;
                this.returnTo = null;
                setTimeout(() => back.isConnected && back.focus());
            }
        });
    }
}

/** "Saved" notes in the bottom corner, read out politely by screen readers. Placed once in the app shell. */
@Component({
    selector: 'fpms-toast-host',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="fpms-toasts" role="status" aria-live="polite">
            @for (t of fb.toasts(); track t.id) {
                <div class="fpms-toast" [class.fpms-toast-info]="t.tone === 'info'">
                    <i class="fas" [class.fa-check-circle]="t.tone === 'success'" [class.fa-info-circle]="t.tone === 'info'" aria-hidden="true"></i>
                    <div class="fpms-toast-text">
                        <strong>{{ t.text }}</strong>
                        @if (t.detail) { <div>{{ t.detail }}</div> }
                    </div>
                    @if (t.action) {
                        <button type="button" class="btn btn-sm btn-outline-primary" (click)="run(t)">{{ t.actionText || 'Undo' }}</button>
                    }
                    <button type="button" class="fpms-toast-close" aria-label="Dismiss" (click)="fb.dismiss(t.id)">&times;</button>
                </div>
            }
        </div>
    `,
})
export class ToastHostComponent {
    readonly fb = inject(FeedbackService);

    run(t: Toast): void {
        this.fb.dismiss(t.id);
        t.action?.();
    }
}

interface FieldValue {
    label: string;
    value: string;
    /** Typed in (text, number, date) rather than chosen (list, tick, option), which may start with a default. */
    typed: boolean;
    note?: string;
}

/**
 * Review before saving on a form (DEC-116). Put fpmsReview on a <form> that saves. When the form is submitted and valid,
 * it lists what was entered (a new record) or what changed (old → new), and goes on to (ngSubmit) only when the person
 * confirms with the form's own submit-button words. Fields come from the form's controls and their labels, so a page
 * needs nothing else. Nothing changed on an existing record: it saves without asking. Mark a field data-review-skip
 * to leave it out.
 */
@Directive({ selector: 'form[fpmsReview]', standalone: true })
export class ReviewFormDirective implements AfterViewInit, OnDestroy {
    /** What the form is about, for the title ("delivery" gives "Check the delivery before saving"). */
    @Input('fpmsReview') subject = '';
    /** Whether the form adds a record; left unset, a form whose typed fields all started empty counts as new. */
    @Input() fpmsReviewNew: boolean | undefined;

    private readonly el = inject<ElementRef<HTMLFormElement>>(ElementRef);
    private readonly ngForm = inject(NgForm);
    private readonly fb = inject(FeedbackService);
    private before = new Map<string, FieldValue>();
    private sub?: Subscription;
    private passing = false;

    private readonly snapshotIfPristine = (): void => {
        if (this.ngForm.form.pristine) {
            this.before = this.read();
        }
    };

    private readonly onSubmit = async (e: Event): Promise<void> => {
        if (this.passing || this.ngForm.form.invalid) {
            return; // Invalid: the form's own hint shows what is missing.
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const after = this.read();
        const isNew = this.fpmsReviewNew ?? [...this.before.values()].every((f) => !f.typed || !f.value);
        const rows: ReviewRow[] = [];
        for (const [key, field] of after) {
            const was = this.before.get(key)?.value ?? '';
            if (isNew) {
                if (field.value && field.value !== 'No') {
                    rows.push({ label: field.label, after: field.value, note: field.note });
                }
            } else if (field.value !== was) {
                rows.push({ label: field.label, before: was || '—', after: field.value || '—', note: field.note });
            }
        }
        const skip = (!isNew && !rows.length) || (isNew && this.fb.reviewMode === 'changes');
        const ok =
            skip ||
            (await this.fb.review({
                title: isNew ? `Check ${this.subject ? 'the ' + this.subject : 'this'} before saving` : `Check your changes${this.subject ? ' to the ' + this.subject : ''}`,
                message: isNew ? undefined : 'Only what changed is listed.',
                rows: rows.slice(0, 14),
                moreCount: Math.max(0, rows.length - 14),
                confirmText: this.submitText(),
                cancelText: 'Back to editing',
            }));
        if (ok) {
            this.fb.lastRows = isNew ? rows : rows.map((r) => ({ label: r.label, after: r.after }));
            this.passing = true;
            try {
                this.ngForm.onSubmit(e);
            } finally {
                this.passing = false;
            }
        }
    };

    ngAfterViewInit(): void {
        const form = this.el.nativeElement;
        // Capture runs before NgForm's own submit listener on the same element.
        form.addEventListener('submit', this.onSubmit, true);
        // The values before an edit: taken while the form is still untouched, just before the first change.
        for (const type of ['pointerdown', 'focusin', 'keydown']) {
            form.addEventListener(type, this.snapshotIfPristine, true);
        }
        this.sub = this.ngForm.form.valueChanges.subscribe(() => setTimeout(this.snapshotIfPristine));
        setTimeout(this.snapshotIfPristine);
    }

    ngOnDestroy(): void {
        const form = this.el.nativeElement;
        form.removeEventListener('submit', this.onSubmit, true);
        for (const type of ['pointerdown', 'focusin', 'keydown']) {
            form.removeEventListener(type, this.snapshotIfPristine, true);
        }
        this.sub?.unsubscribe();
    }

    private submitText(): string {
        const button = this.el.nativeElement.querySelector<HTMLButtonElement>('button[type=submit]');
        return clean(button?.textContent) || 'Save';
    }

    /** Every named field of the form, as the person sees it: its label and its shown value. */
    private read(): Map<string, FieldValue> {
        const out = new Map<string, FieldValue>();
        const at = new Map<string, Element>();
        const form = this.el.nativeElement;
        let n = 0;
        for (const node of Array.from(form.elements)) {
            const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            n++;
            // [name]="…" bound in a template goes to NgModel, not the element, so fall back on the id or position.
            const name = el.getAttribute('name') || el.id || (el.matches('input, select, textarea') && el.getAttribute('aria-label') ? `${el.getAttribute('aria-label')}#${n}` : '');
            if (!name || el.closest('[data-review-skip]') || ['submit', 'button', 'hidden', 'search'].includes((el as HTMLInputElement).type)) {
                continue;
            }
            if ((el as HTMLInputElement).type === 'radio') {
                if (!out.has(name)) {
                    const checked = el.getAttribute('name')
                        ? form.querySelector<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]:checked`)
                        : (el as HTMLInputElement).checked
                          ? (el as HTMLInputElement)
                          : null;
                    out.set(name, { label: groupLabel(el) || name, value: checked ? labelOf(checked) : '', typed: false });
                    at.set(name, el);
                }
                continue;
            }
            const typed = !(el instanceof HTMLSelectElement) && (el as HTMLInputElement).type !== 'checkbox';
            const warn = el.closest('.form-group')?.querySelector('.text-warning-dark, .text-danger:not(label .text-danger)');
            out.set(name, { label: labelOf(el) || name, value: shown(el), typed, note: clean(warn?.textContent) || undefined });
            at.set(name, el);
        }
        // Choices made with buttons (record type, pond, cause): a radiogroup and the option marked as chosen.
        for (const group of Array.from(form.querySelectorAll<HTMLElement>('[role=radiogroup]'))) {
            const label = clean(group.getAttribute('aria-label'));
            if (!label || group.closest('[data-review-skip]') || group.querySelector('input[type=radio]')) {
                continue;
            }
            const chosen = group.querySelector<HTMLElement>('[role=radio][aria-checked=true]');
            out.set('rg:' + label, { label, value: clean(chosen?.getAttribute('aria-label') || chosen?.textContent), typed: false });
            at.set('rg:' + label, group);
        }
        // In the order the fields appear on screen.
        const keys = [...out.keys()].sort((a, b) => (at.get(a)!.compareDocumentPosition(at.get(b)!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        return new Map(keys.map((k) => [k, out.get(k)!]));
    }
}

function clean(text: string | null | undefined): string {
    return (text ?? '').replace(/\*/g, '').replace(/\(optional\)/gi, '').replace(/\s+/g, ' ').trim();
}

function labelOf(el: HTMLElement): string {
    const form = el.closest('form');
    if (el.id && form) {
        const label = form.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) {
            return clean(label.textContent);
        }
    }
    return clean(el.closest('label')?.textContent) || clean(el.getAttribute('aria-label')) || clean(el.getAttribute('placeholder'));
}

function groupLabel(el: HTMLElement): string {
    const group = el.closest('fieldset, .form-group');
    const label = group?.querySelector('legend, label:not(.custom-control-label), .d-block');
    return clean(label?.textContent);
}

function shown(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
    if (el instanceof HTMLSelectElement) {
        return el.selectedIndex >= 0 && el.value !== '' ? clean(el.selectedOptions[0]?.textContent) : '';
    }
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        return el.checked ? 'Yes' : 'No';
    }
    const value = (el.value ?? '').trim();
    if (!value) {
        return '';
    }
    if (el instanceof HTMLInputElement && el.type === 'date') {
        return FarmTime.date(value);
    }
    if (el instanceof HTMLInputElement && el.type === 'datetime-local') {
        return FarmTime.dateTime(FarmTime.fromLocalInput(value));
    }
    if (el instanceof HTMLInputElement && el.type === 'password') {
        return '••••••••';
    }
    const unit = clean(el.closest('.input-group')?.querySelector('.input-group-text')?.textContent);
    return unit && !unit.startsWith('₱') ? `${value} ${unit}` : unit ? `${unit} ${value}` : value;
}
