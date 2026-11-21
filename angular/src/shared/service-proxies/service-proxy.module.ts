import { NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AbpHttpConfigurationService, AbpHttpInterceptor } from 'abp-ng2-module';
import { FpmsHttpConfigurationService } from '@shared/fpms/http-configuration.service';

import * as ApiServiceProxies from './service-proxies';

@NgModule({
    providers: [
        ApiServiceProxies.SessionServiceProxy,
        ApiServiceProxies.TokenAuthServiceProxy,
        ApiServiceProxies.AccountServiceProxy,
        { provide: HTTP_INTERCEPTORS, useClass: AbpHttpInterceptor, multi: true },
        // DEC-133: clearer no-connection message; an ended sign-in returns to the same page.
        { provide: AbpHttpConfigurationService, useClass: FpmsHttpConfigurationService },
    ],
})
export class ServiceProxyModule {}
