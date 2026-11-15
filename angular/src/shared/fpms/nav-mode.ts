import { signal } from '@angular/core';

/**
 * The sidebar collapsed to icons (DEC-119). Kept per browser, like the colour theme; the first visit starts expanded.
 * Below 992 px the sidebar is always the icon bar (DEC-120).
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

let watching = false;

/**
 * Sets body.fpms-nav-mini: the saved choice on a desktop-width window, always on a narrower one, which has no
 * slide-in menu (DEC-120). Call once at start-up; it follows the window's width from then on.
 */
export function applyNavMode(): void {
    document.body.classList.toggle('fpms-nav-mini', navMini() || !isDesktopWidth());
    if (!watching) {
        watching = true;
        window.matchMedia('(min-width: 992px)').addEventListener('change', () => applyNavMode());
    }
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
