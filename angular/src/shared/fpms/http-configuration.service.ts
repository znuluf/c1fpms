import { Injectable } from '@angular/core';
import { AbpHttpConfigurationService } from 'abp-ng2-module';

/**
 * How the app reacts to failed requests (DEC-133), on top of ABP's defaults.
 * - No connection (status 0): says nothing was saved and that the entry is still on the page, instead of
 *   "An error has occurred! Error details were not sent by server."
 * - Sign-in ended (401): says so, then reloads this page rather than the home page. Signing in again returns here
 *   (AppAuthService.urlAfterSignIn), where the form's draft brings the entry back.
 */
@Injectable()
export class FpmsHttpConfigurationService extends AbpHttpConfigurationService {
    override defaultError401 = {
        code: 401,
        message: 'Your sign-in has ended',
        details: 'Sign in again to continue. You will come back to this page; forms that keep a draft bring your entry back.',
        validationErrors: [],
    };

    override handleNonAbpErrorResponse(response: any): void {
        if (response?.status === 0) {
            this.showError({
                code: 0,
                message: 'Not saved: no connection to the farm server',
                details: 'Check the Wi-Fi, then try again. What you typed is still on this page.',
                validationErrors: [],
            });
            return;
        }
        super.handleNonAbpErrorResponse(response);
    }

    override handleTargetUrl(targetUrl: string): void {
        // ABP sends "/" after a 401; reloading this page keeps the person where they were.
        if (!targetUrl || targetUrl === '/') {
            location.reload();
            return;
        }
        super.handleTargetUrl(targetUrl);
    }
}
