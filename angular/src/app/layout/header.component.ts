import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { HeaderLeftNavbarComponent } from './header-left-navbar.component';
import { HeaderClockComponent } from './header-clock.component';
import { HeaderNotificationsComponent } from './header-notifications.component';
import { HeaderOutboxComponent } from './header-outbox.component';
import { AppSessionService } from '@shared/session/app-session.service';

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [HeaderLeftNavbarComponent, HeaderClockComponent, HeaderNotificationsComponent, HeaderOutboxComponent],
})
export class HeaderComponent {
    readonly isHost = !inject(AppSessionService).tenant;
}
