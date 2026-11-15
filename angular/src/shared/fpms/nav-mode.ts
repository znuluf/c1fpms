import { signal } from '@angular/core';

/**
 * The sidebar collapsed to icons on a desktop-width window (DEC-119). Kept per browser, like the colour theme; the
 * first visit starts expanded. Phones and narrow windows keep the slide-in menu and ignore this.
 */
const KEY = 'fpms.nav';

function read(): boolean {
    try {
        return localStorage.getItem(KEY) === 'mini';
    } catch {
        return false;
    }
}

export const navMini = signal(read());

export function isDesktopWidth(): boolean {
    return window.matchMedia('(min-width: 992px)').matches;
}

/** Sets body.fpms-nav-mini from the saved choice. Call once at start-up. */
export function applyNavMode(): void {
    document.body.classList.toggle('fpms-nav-mini', navMini());
}

export function setNavMini(mini: boolean): void {
    navMini.set(mini);
    try {
        localStorage.setItem(KEY, mini ? 'mini' : 'full');
    } catch {
        // Storage can be blocked; the choice then lasts until the page is reloaded.
    }
    applyNavMode();
}
