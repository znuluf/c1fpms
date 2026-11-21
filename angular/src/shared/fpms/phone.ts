import { Directive, ElementRef, inject } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

/**
 * The one phone number format the system accepts (capstone consultation, 21 Nov 2026), the same as
 * PhilippinePhone in the API:
 *   mobile    0917 123 4567
 *   landline  (083) 552 1234   (3-digit area code, 7 digits)
 *   Metro Manila  (02) 8123 4567
 */
export const PHONE_EXAMPLE = '0917 123 4567';
export const PHONE_MESSAGE = 'Enter a Philippine phone number as 0917 123 4567 (mobile) or (083) 552 1234 (landline).';

const MOBILE = /^09\d{2} \d{3} \d{4}$/;
const LANDLINE = /^\(0[3-9]\d\) \d{3} \d{4}$/;
const METRO_MANILA = /^\(02\) \d{4} \d{4}$/;

export function isValidPhone(value: string | null | undefined): boolean {
    const v = (value ?? '').trim();
    return MOBILE.test(v) || LANDLINE.test(v) || METRO_MANILA.test(v);
}

/**
 * Writes what a person typed or pasted in the system format, as far as the digits go: "+63 917-123-4567",
 * "09171234567" and "917 123 4567" all become "0917 123 4567". Letters and symbols are dropped. A number that is
 * not complete is left partly written, and the field's check says what is wrong.
 */
export function formatPhone(raw: string | null | undefined): string {
    let digits = (raw ?? '').replace(/\D/g, '');
    if (digits.startsWith('63') && (raw ?? '').trim().startsWith('+')) {
        digits = '0' + digits.slice(2);
    } else if (digits.startsWith('63') && digits.length > 11) {
        digits = '0' + digits.slice(2);
    } else if (digits.startsWith('9') && digits.length >= 10) {
        digits = '0' + digits;
    }

    digits = digits.slice(0, 11);
    if (digits.startsWith('09')) {
        return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(' ');
    }

    if (digits.startsWith('02')) {
        digits = digits.slice(0, 10);
        return digits.length <= 2 ? digits : `(02) ${[digits.slice(2, 6), digits.slice(6, 10)].filter(Boolean).join(' ')}`;
    }

    if (digits.startsWith('0') && digits.length > 3) {
        digits = digits.slice(0, 10);
        return `(${digits.slice(0, 3)}) ${[digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(' ')}`;
    }

    return digits;
}

/** A number already on record, shown in the system format when it can be; otherwise as it was, so the field can say what is wrong. */
export function tidyPhone(value: string | null | undefined): string {
    const formatted = formatPhone(value);
    return isValidPhone(formatted) ? formatted : (value ?? '');
}

/**
 * On a text input: writes the number in the system format as it is typed or pasted, and reports "phone" when what is
 * there is not a complete number in that format. Empty is valid; add `required` where a number is needed.
 */
@Directive({
    standalone: true,
    selector: 'input[fpmsPhone]',
    providers: [{ provide: NG_VALIDATORS, useExisting: PhoneInputDirective, multi: true }],
    host: {
        type: 'tel',
        inputmode: 'tel',
        autocomplete: 'tel',
        maxlength: '15',
        placeholder: PHONE_EXAMPLE,
        '(input)': 'format()',
    },
})
export class PhoneInputDirective implements Validator {
    private el = inject<ElementRef<HTMLInputElement>>(ElementRef);

    format(): void {
        const input = this.el.nativeElement;
        const formatted = formatPhone(input.value);
        if (formatted !== input.value) {
            input.value = formatted;
            // The form reads the field on "input"; send it again with the formatted text (it then matches, so this stops).
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    validate(control: AbstractControl): ValidationErrors | null {
        const v = control.value;
        return !v || isValidPhone(v) ? null : { phone: true };
    }
}
