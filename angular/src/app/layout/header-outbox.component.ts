import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FpmsOutbox } from '@shared/fpms/outbox';
import { FeedbackService } from '@shared/fpms/feedback';
import { FarmDateTimePipe } from '@shared/fpms/pipes';

/**
 * Entries kept on this tablet while the farm server could not be reached (DEC-135): a count in the top bar while any
 * are waiting, and the list with what happened to each. Nothing shows when the outbox is empty.
 */
@Component({
    selector: 'header-outbox',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (outbox.items().length) {
            <li class="nav-item">
                <button type="button" class="nav-link btn btn-link fpms-outbox-btn" [class.is-refused]="refusedCount() > 0" (click)="outbox.panelOpen.set(true)">
                    <i class="fas" [class.fa-cloud-upload-alt]="!refusedCount()" [class.fa-exclamation-circle]="refusedCount() > 0" aria-hidden="true"></i>
                    <span>{{ summary() }}</span>
                </button>
            </li>
        }
    `,
})
export class HeaderOutboxComponent {
    readonly outbox = inject(FpmsOutbox);
    readonly refusedCount = computed(() => this.outbox.items().filter((i) => !!i.refusedReason).length);
    readonly summary = computed(() => {
        const w = this.outbox.items().length - this.refusedCount();
        const r = this.refusedCount();
        return [w ? `${w} to send` : '', r ? `${r} not accepted` : ''].filter((x) => x).join(', ');
    });
}

/** The list of kept entries, opened from the top bar; at the app's top level so nothing covers it. */
@Component({
    selector: 'fpms-outbox-panel',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FarmDateTimePipe],
    template: `
        @if (outbox.panelOpen()) {
            <div class="fpms-dialog-backdrop" (click)="outbox.panelOpen.set(false)">
                <div class="fpms-dialog fpms-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="outbox-h" (click)="$event.stopPropagation()" (keydown.escape)="outbox.panelOpen.set(false)">
                    <div class="fpms-dialog-head">
                        <h2 id="outbox-h" class="mr-auto">Kept on this tablet</h2>
                        <button type="button" class="fpms-dialog-close" aria-label="Close" (click)="outbox.panelOpen.set(false)"><span aria-hidden="true">&times;</span></button>
                    </div>
                    <div class="fpms-dialog-body">
                        <p>
                            These entries were saved while the farm server could not be reached. They are only on this tablet until they are sent,
                            which happens by itself when the connection is back. Keep this tablet's browser data until the list is empty.
                        </p>
                        <ul class="fpms-outbox-list">
                            @for (i of outbox.items(); track i.id) {
                                <li [class.is-refused]="!!i.refusedReason">
                                    <div class="fpms-outbox-what">
                                        <strong>{{ i.label }}</strong>
                                        <span class="fpms-outbox-when">Kept {{ i.queuedAt | farmDateTime }}</span>
                                    </div>
                                    @if (i.refusedReason) {
                                        <p class="fpms-outbox-state"><i class="fas fa-times-circle" aria-hidden="true"></i><span>Not accepted: {{ i.refusedReason }}</span></p>
                                        <div class="fpms-outbox-actions">
                                            <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="outbox.sending()" (click)="outbox.retry(i.id)">Try again</button>
                                            <button type="button" class="btn btn-sm btn-outline-danger" [disabled]="outbox.sending()" (click)="discard(i)">Discard</button>
                                        </div>
                                    } @else {
                                        <p class="fpms-outbox-state"><i class="fas fa-clock" aria-hidden="true"></i><span>Waiting to send</span></p>
                                        <div class="fpms-outbox-actions">
                                            <button type="button" class="btn btn-sm btn-outline-danger" [disabled]="outbox.sending()" (click)="discard(i)">Discard</button>
                                        </div>
                                    }
                                </li>
                            } @empty {
                                <li class="fpms-outbox-done"><i class="fas fa-check-circle" aria-hidden="true"></i><span>Everything was sent.</span></li>
                            }
                        </ul>
                    </div>
                    <div class="fpms-dialog-foot">
                        @if (waitingCount()) {
                            <button type="button" class="btn btn-primary" [disabled]="outbox.sending()" (click)="outbox.flush()">
                                {{ outbox.sending() ? 'Sending…' : 'Send now' }}
                            </button>
                        }
                        <button type="button" class="btn btn-default" (click)="outbox.panelOpen.set(false)">Close</button>
                        @if (outbox.offline() && waitingCount()) {
                            <span class="fpms-outbox-hint">No connection to the farm server yet.</span>
                        }
                    </div>
                </div>
            </div>
        }
    `,
})
export class OutboxPanelComponent {
    readonly outbox = inject(FpmsOutbox);
    private readonly feedback = inject(FeedbackService);
    readonly waitingCount = computed(() => this.outbox.items().filter((i) => !i.refusedReason).length);

    async discard(i: { id: string; label: string }): Promise<void> {
        const ok = await this.feedback.review({
            title: 'Discard this entry?',
            message: `"${i.label}" is only on this tablet. Discarding it deletes it; it will not be recorded.`,
            confirmText: 'Discard',
            cancelText: 'Cancel',
            danger: true,
        });
        if (ok) {
            this.outbox.discard(i.id);
        }
    }
}
