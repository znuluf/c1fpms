import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FPMS_PIPES } from '@shared/fpms/pipes';
import { FPMS_UI } from '@shared/fpms/ui';
import { ReviewFormDirective } from '@shared/fpms/feedback';
import { FormRowAlignDirective } from '@shared/fpms/form-row.directive';
import { PhoneInputDirective } from '@shared/fpms/phone';

/** Common imports for FPMS standalone pages. */
export const FPMS_IMPORTS = [CommonModule, FormsModule, RouterLink, ...FPMS_PIPES, ...FPMS_UI, ReviewFormDirective, FormRowAlignDirective, PhoneInputDirective];
