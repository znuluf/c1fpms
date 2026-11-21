import { Injectable, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConsts } from '@shared/AppConsts';
import { FeedbackService } from './feedback';

/**
 * Entries saved while the farm server cannot be reached (DEC-135). New log entries, feedings and pond preparation
 * entries carry a request id, so sending one twice never makes a second copy (DEC-133, DEC-134). When the first try
 * gets no response at all, the entry is kept on this tablet and sent by itself, in the order it was made, when the
 * connection is back. Corrections, harvests and sales are not kept: they need the server's current version, or give
 * a lot code or receipt number to hand over on the spot.
 *
 * Kept per farm and person, like form drafts, and never expires: an entry leaves only when the server accepts it or
 * the person discards it. A refusal (the batch was closed, someone recorded the feeding first) stays in the list
 * with the server's reason.
 */
export interface OutboxItem {
    id: string;
    service: string;
    method: string;
    body: unknown;
    /** What the person recorded, in their words on screen: "Feeding 2, EP-01, 21 Nov 9:30 AM". */
    label: string;
    queuedAt: number;
    attempts: number;
    /** Set when the server refused it; the item then waits for the person. */
    refusedReason: string | null;
}

/** `kept` is true when the entry stayed on this tablet; otherwise `result` is the server's answer. */
export interface KeepResult<T> {
    kept: boolean;
    result?: T;
}

const PREFIX = 'fpms.outbox.';
const RETRY_MS = 20_000;
/** A server error (5xx) is tried again this many times before the entry waits for the person. */
const SERVER_ERROR_TRIES = 5;

function owner(): string | null {
    const s = (globalThis as any).abp?.session;
    return s?.userId ? `${s.tenantId ?? 'host'}.${s.userId}` : null;
}

function newId(): string {
    return (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** The server's own error, or a generic one: what to show for a refused entry. */
function reasonOf(e: HttpErrorResponse): string {
    const error = (e.error as any)?.error;
    const parts = [error?.message, error?.details].filter((x) => typeof x === 'string' && x.trim());
    return parts.length ? parts.join(' ') : `The farm server refused it (error ${e.status}).`;
}

/**
 * ABP answers a refusal by a business rule (the batch was closed, someone recorded the feeding first) with status 500 and a
 * message written for the person; an unexpected error has its generic message. The first is final, the second worth retrying.
 */
function isRuleRefusal(e: HttpErrorResponse): boolean {
    const body = e.error as any;
    const message: string = body?.error?.message ?? '';
    return !!body?.__abp && !!message && !/internal error occurred/i.test(message);
}

class SendFailure extends Error {
    constructor(
        readonly kind: 'offline' | 'signedOut' | 'refused' | 'serverError',
        readonly reason: string,
        readonly response?: HttpErrorResponse
    ) {
        super(reason);
    }
}

@Injectable({ providedIn: 'root' })
export class FpmsOutbox {
    /** Requests that skip the app's interceptors, so a background send never shows a dialog or reloads the page. */
    private readonly http = new HttpClient(inject(HttpBackend));
    private readonly feedback = inject(FeedbackService);

    readonly items = signal<OutboxItem[]>([]);
    readonly sending = signal(false);
    readonly panelOpen = signal(false);
    /** True when the last try had no connection; cleared by the next answer from the server. */
    readonly offline = signal(false);
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.reload();
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => void this.flush());
            window.addEventListener('storage', (e) => e.key?.startsWith(PREFIX) && this.reload());
        }
    }

    /** Waiting to be sent (not refused). */
    waiting(): OutboxItem[] {
        return this.items().filter((i) => !i.refusedReason);
    }

    refused(): OutboxItem[] {
        return this.items().filter((i) => !!i.refusedReason);
    }

    /**
     * Sends a new entry. With no response from the server it is kept on this tablet instead and `{ kept: true }` is
     * returned; a refusal or any other error is shown as usual and thrown, as a normal save does.
     */
    async save<T>(service: string, method: string, body: unknown, label: string): Promise<KeepResult<T>> {
        try {
            const result = await this.post<T>(service, method, body);
            this.offline.set(false);
            void this.flush();
            return { kept: false, result };
        } catch (e) {
            if (e instanceof SendFailure && e.kind === 'offline') {
                this.add({ id: newId(), service, method, body, label, queuedAt: Date.now(), attempts: 1, refusedReason: null });
                this.offline.set(true);
                return { kept: true };
            }
            if (e instanceof SendFailure && e.kind === 'signedOut') {
                // Kept too, so signing in again sends it; ABP's own handling then says the sign-in ended.
                this.add({ id: newId(), service, method, body, label, queuedAt: Date.now(), attempts: 1, refusedReason: null });
                const cfg = (globalThis as any).abp?.message;
                cfg?.warn?.('Your entry is kept on this tablet and is sent after you sign in again.', 'Your sign-in has ended')?.then?.(() => location.reload());
                return { kept: true };
            }
            if (e instanceof SendFailure) {
                const error = (e.response?.error as any)?.error;
                (globalThis as any).abp?.message?.error?.(error?.details || '', error?.message || 'Not saved');
            }
            throw e;
        }
    }

    /** Sends what is waiting, oldest first; stops at the first try without a connection. */
    async flush(): Promise<void> {
        if (this.sending() || !owner()) {
            return;
        }
        this.reload();
        const queue = this.waiting();
        if (!queue.length) {
            this.stopTimer();
            return;
        }
        this.sending.set(true);
        let sent = 0;
        try {
            for (const item of queue) {
                try {
                    await this.post(item.service, item.method, item.body);
                    this.remove(item.id);
                    sent++;
                    this.offline.set(false);
                } catch (e) {
                    const f = e instanceof SendFailure ? e : new SendFailure('offline', String(e));
                    if (f.kind === 'refused' || (f.kind === 'serverError' && item.attempts + 1 >= SERVER_ERROR_TRIES)) {
                        this.update(item.id, { refusedReason: f.reason, attempts: item.attempts + 1 });
                        this.offline.set(false);
                        continue;
                    }
                    this.update(item.id, { attempts: item.attempts + 1 });
                    this.offline.set(f.kind === 'offline');
                    break;
                }
            }
        } finally {
            this.sending.set(false);
        }
        if (sent) {
            this.feedback.toast({ text: sent === 1 ? '1 kept entry sent.' : `${sent} kept entries sent.`, detail: 'They are now on the farm server.' });
        }
        if (this.refused().length && sent) {
            this.panelOpen.set(true);
        }
        this.waiting().length ? this.startTimer() : this.stopTimer();
    }

    discard(id: string): void {
        this.remove(id);
    }

    /** Tries a refused entry again (after the person fixed the cause, for example reopened the batch). */
    retry(id: string): void {
        this.update(id, { refusedReason: null });
        void this.flush();
    }

    // ---------------------------------------------------------------- storage

    private key(): string | null {
        const who = owner();
        return who ? `${PREFIX}${who}` : null;
    }

    private reload(): void {
        const key = this.key();
        let list: OutboxItem[] = [];
        if (key) {
            try {
                const raw = localStorage.getItem(key);
                list = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
            } catch {
                list = [];
            }
        }
        this.items.set(Array.isArray(list) ? list : []);
        if (this.waiting().length) {
            this.startTimer();
        }
    }

    private write(list: OutboxItem[]): void {
        this.items.set(list);
        const key = this.key();
        if (!key) {
            return;
        }
        try {
            if (list.length) {
                localStorage.setItem(key, JSON.stringify(list));
            } else {
                localStorage.removeItem(key);
            }
        } catch {
            // Storage blocked or full: the entry stays in this page until it is sent or the page closes.
        }
    }

    private add(item: OutboxItem): void {
        this.reload();
        this.write([...this.items(), item]);
        this.startTimer();
    }

    private remove(id: string): void {
        this.reload();
        this.write(this.items().filter((i) => i.id !== id));
    }

    private update(id: string, change: Partial<OutboxItem>): void {
        this.reload();
        this.write(this.items().map((i) => (i.id === id ? { ...i, ...change } : i)));
    }

    private startTimer(): void {
        if (!this.timer && typeof window !== 'undefined') {
            this.timer = setInterval(() => void this.flush(), RETRY_MS);
        }
    }

    private stopTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // ---------------------------------------------------------------- request

    /** One POST with the headers ABP's interceptor adds (token, farm, language, anti-forgery). */
    private async post<T>(service: string, method: string, body: unknown): Promise<T> {
        const abp = (globalThis as any).abp;
        let headers = new HttpHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
        const token = abp?.auth?.getToken?.();
        if (token) {
            headers = headers.set('Authorization', `Bearer ${token}`);
        }
        const tenantCookie = abp?.multiTenancy?.tenantIdCookieName;
        const tenantId = tenantCookie ? abp?.utils?.getCookieValue?.(tenantCookie) : null;
        if (tenantId) {
            headers = headers.set(tenantCookie, tenantId);
        }
        const culture = abp?.utils?.getCookieValue?.('Abp.Localization.CultureName');
        if (culture) {
            headers = headers.set('.AspNetCore.Culture', culture).set('Accept-Language', culture);
        }
        const af = abp?.security?.antiForgery;
        const xsrf = af?.getToken?.();
        if (xsrf) {
            headers = headers.set(af.tokenHeaderName || 'X-XSRF-TOKEN', xsrf);
        }
        try {
            const response: any = await firstValueFrom(
                this.http.post(`${AppConsts.remoteServiceBaseUrl}/api/services/app/${service}/${method}`, JSON.stringify(body ?? {}), { headers, withCredentials: false })
            );
            return (response?.__abp ? response.result : response) as T;
        } catch (e) {
            if (e instanceof HttpErrorResponse) {
                if (e.status === 0) {
                    throw new SendFailure('offline', 'No connection to the farm server.', e);
                }
                if (e.status === 401) {
                    throw new SendFailure('signedOut', 'Sign in again to send it.', e);
                }
                if (e.status === 502 || e.status === 503 || e.status === 504) {
                    // A proxy answered but the farm server did not: the same as no connection.
                    throw new SendFailure('offline', 'The farm server did not answer.', e);
                }
                if (e.status >= 500 && !isRuleRefusal(e)) {
                    throw new SendFailure('serverError', reasonOf(e), e);
                }
                throw new SendFailure('refused', reasonOf(e), e);
            }
            throw new SendFailure('offline', String(e));
        }
    }
}
