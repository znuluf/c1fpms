import { signal, Component, ChangeDetectionStrategy, HostListener, Renderer2, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppAuthService } from '@shared/auth/app-auth.service';
import { LayoutStoreService } from '@shared/layout/layout-store.service';
import { SidebarLogoComponent } from './sidebar-logo.component';
import { SidebarUserPanelComponent } from './sidebar-user-panel.component';
import { SidebarMenuComponent } from './sidebar-menu.component';
import { isDesktopWidth, navMini, setNavMini } from '@shared/fpms/nav-mode';

@Component({
    // tslint:disable-next-line:component-selector
    selector: 'sidebar',
    templateUrl: './sidebar.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [SidebarLogoComponent, SidebarUserPanelComponent, SidebarMenuComponent, RouterLink],
})
export class SidebarComponent implements OnInit {
    sidebarExpanded: boolean;
    private _authService = inject(AppAuthService);

    constructor(
        private renderer: Renderer2,
        private _layoutStore: LayoutStoreService
    ) {}

    ngOnInit(): void {
        let first = true;
        this._layoutStore.sidebarExpanded.subscribe((value) => {
            this.sidebarExpanded = value;
            // The store's first value is only its starting state: on a phone the drawer starts closed (DEC-119).
            if (first) {
                first = false;
                if (!this.isDesktop) {
                    this.hideSidebar();
                }
                return;
            }
            this.toggleSidebar();
        });
    }

    readonly navMini = navMini;
    /** The label of the icon under the pointer or focus while collapsed, beside it (DEC-119). */
    readonly tip = signal<{ text: string; top: number } | null>(null);

    toggleMini(): void {
        setNavMini(!navMini());
        this.tip.set(null);
    }

    showTip(event: Event): void {
        if (!navMini() || !isDesktopWidth()) {
            return;
        }
        const link = (event.target as HTMLElement).closest<HTMLElement>('.nav-link, .fpms-user-panel');
        const text = link?.querySelector('p, span:not(.fpms-avatar), .fpms-user-name')?.textContent?.trim();
        if (!link || !text) {
            this.tip.set(null);
            return;
        }
        const r = link.getBoundingClientRect();
        this.tip.set({ text, top: r.top + r.height / 2 });
    }

    logout(): void {
        this._authService.logout();
    }

    /** On a desktop-width window the navigation is always open; only phones and narrow windows use the drawer. */
    @HostListener('window:resize')
    onResize(): void {
        if (this.isDesktop) {
            this.renderer.removeClass(document.body, 'sidebar-collapse');
        }
    }

    private get isDesktop(): boolean {
        return window.matchMedia('(min-width: 992px)').matches;
    }

    toggleSidebar(): void {
        if (this.isDesktop) {
            this.renderer.removeClass(document.body, 'sidebar-collapse');
            return;
        }
        // Each press opens a closed drawer or closes an open one; the store's value only says that it was pressed.
        if (document.body.classList.contains('sidebar-open')) {
            this.hideSidebar();
        } else {
            this.showSidebar();
        }
    }

    showSidebar(): void {
        this.renderer.removeClass(document.body, 'sidebar-collapse');
        this.renderer.addClass(document.body, 'sidebar-open');
    }

    hideSidebar(): void {
        this.renderer.removeClass(document.body, 'sidebar-open');
        this.renderer.addClass(document.body, 'sidebar-collapse');
    }
}
