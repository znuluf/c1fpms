import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

/**
 * A short list of times of day, one picker per row (DEC-123): the farm's feeding schedule. Its value is the same
 * comma-separated "06:00, 10:00" text the server reads, so nothing else changes. Rows keep themselves in time order and
 * renumber; a time used twice is flagged. The inner inputs do not use ngModel, so they do not join the parent form as
 * controls of their own; they carry ids and labels, so the review before saving still lists each one.
 */
@Component({
    selector: 'fpms-time-list',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeListComponent), multi: true },
        { provide: NG_VALIDATORS, useExisting: forwardRef(() => TimeListComponent), multi: true },
    ],
    template: `
        <div class="fpms-times" role="group" [attr.aria-label]="label()">
            @for (t of times(); track $index; let i = $index) {
                <div class="fpms-time">
                    <label class="fpms-time-label" [for]="idPrefix() + i">{{ itemLabel() }} {{ i + 1 }}</label>
                    <input
                        type="time"
                        class="fpms-input"
                        [id]="idPrefix() + i"
                        [value]="t"
                        [disabled]="disabled()"
                        [class.fpms-input-invalid]="!t || dupes().has(t)"
                        (change)="set(i, $any($event.target).value)"
                        (blur)="sort()" />
                    <button
                        type="button"
                        class="fpms-button fpms-button-secondary fpms-time-remove"
                        [disabled]="disabled() || times().length <= min()"
                        [attr.aria-label]="'Remove ' + itemLabel().toLowerCase() + ' ' + (i + 1)"
                        [title]="'Remove ' + itemLabel().toLowerCase() + ' ' + (i + 1)"
                        (click)="remove(i)">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
            }
        </div>
        <div class="fpms-times-foot">
            <button type="button" class="fpms-button fpms-button-outline" [disabled]="disabled() || times().length >= max()" (click)="add()">
                <i class="fas fa-plus fpms-icon-gap" aria-hidden="true"></i>Add {{ itemLabel().toLowerCase() }}
            </button>
            <span class="fpms-text-muted">{{ count() }} a day{{ times().length >= max() ? ' (the most allowed)' : '' }}</span>
        </div>
        @if (dupes().size) {
            <small class="fpms-form-message fpms-form-message-error"><i class="fas fa-exclamation-circle fpms-icon-gap" aria-hidden="true"></i>Two {{ itemLabel().toLowerCase() }}s are at {{ dupeText() }}. Change or remove one.</small>
        }
        @if (hasEmpty()) {
            <small class="form-text text-danger"><i class="fas fa-exclamation-circle fpms-icon-gap" aria-hidden="true"></i>Choose a time for every {{ itemLabel().toLowerCase() }}, or remove it.</small>
        }
    `,
})
export class TimeListComponent implements ControlValueAccessor, Validator {
    /** What one row is called ("Feeding"). */
    readonly itemLabel = input('Feeding');
    /** The group's name for screen readers. */
    readonly label = input('Feeding schedule');
    readonly idPrefix = input('ftime-');
    readonly min = input(1);
    readonly max = input(8);
    /** Used when the saved value is blank. */
    readonly fallback = input('06:00, 10:00, 14:00, 18:00');

    readonly times = signal<string[]>([]);
    readonly disabled = signal(false);
    readonly dupes = computed(() => {
        const seen = new Set<string>();
        const twice = new Set<string>();
        for (const t of this.times()) {
            if (t && seen.has(t)) {
                twice.add(t);
            }
            seen.add(t);
        }
        return twice;
    });
    readonly dupeText = computed(() => [...this.dupes()].join(', '));
    readonly hasEmpty = computed(() => this.times().some((t) => !t));
    readonly count = computed(() => this.times().filter((t) => t).length);

    private onChange: (value: string) => void = () => {};
    private onTouched: () => void = () => {};

    writeValue(value: string | null): void {
        const list = parse(value || this.fallback());
        this.times.set(list.length ? list : parse(this.fallback()));
    }

    registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled.set(isDisabled);
    }

    set(i: number, value: string): void {
        const next = [...this.times()];
        next[i] = value;
        this.times.set(next);
        this.emit();
    }

    /** Back into time order once the person leaves a field, so "Feeding 1" is always the earliest. */
    sort(): void {
        const sorted = [...this.times()].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
        if (sorted.join() !== this.times().join()) {
            this.times.set(sorted);
            this.emit();
        }
        this.onTouched();
    }

    /** A new row two hours after the last one (or 06:00), which the person then adjusts. */
    add(): void {
        const last = [...this.times()].filter((t) => t).sort().pop();
        let next = '06:00';
        if (last) {
            const [h, m] = last.split(':').map(Number);
            next = `${String(Math.min(h + 2, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        this.times.set([...this.times(), next]);
        this.emit();
        this.sort();
    }

    remove(i: number): void {
        this.times.set(this.times().filter((_, k) => k !== i));
        this.emit();
    }

    /** A time used twice, or a row with no time, keeps the form from saving. */
    validate(_: AbstractControl): ValidationErrors | null {
        return this.dupes().size ? { duplicateTime: true } : this.hasEmpty() ? { emptyTime: true } : null;
    }

    private onValidatorChange: () => void = () => {};

    registerOnValidatorChange(fn: () => void): void {
        this.onValidatorChange = fn;
    }

    private emit(): void {
        this.onValidatorChange();
        this.onChange(this.times().filter((t) => t).join(', '));
    }
}

function parse(value: string): string[] {
    return String(value)
        .split(/[,;\s]+/)
        .map((t) => t.trim())
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => t.padStart(5, '0'));
}
