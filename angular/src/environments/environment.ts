// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `angular-cli.json`.

export const environment = {
    production: false,
    appConfig: 'appconfig.json',
    /**
     * One-click sign-in buttons on the login page, development only (see docs/dev-accounts.md).
     * environment.prod.ts leaves this empty, so these never reach a production build.
     */
    devAccounts: [
        { group: 'Simple sample (FPMS_Simple)', label: 'Abi (owner)', farmCode: 'rkabubba-aqua', userName: 'arkabubba', password: 'Fpms@2026' },
        { group: 'Simple sample (FPMS_Simple)', label: 'Sam (owner)', farmCode: 'rkabubba-aqua', userName: 'samsedel', password: 'Fpms@2026' },
        { group: 'Simple sample (FPMS_Simple)', label: 'Kim (tech)', farmCode: 'rkabubba-aqua', userName: 'konacsus', password: 'Fpms@2026' },
        { group: 'Simple sample (FPMS_Simple)', label: 'Far (tech)', farmCode: 'rkabubba-aqua', userName: 'filusyam', password: 'Fpms@2026' },
        { group: 'Farmi (FPMS_Scenarios)', label: 'Raf (owner)', farmCode: 'farmi', userName: 'rafah', password: 'Fpms@2026' },
        { group: 'Farmi (FPMS_Scenarios)', label: 'Har (owner)', farmCode: 'farmi', userName: 'haraff', password: 'Fpms@2026' },
        { group: 'Farmi (FPMS_Scenarios)', label: 'May (tech)', farmCode: 'farmi', userName: 'maysuli', password: 'Fpms@2026' },
        { group: 'Farmi (FPMS_Scenarios)', label: 'Yam (tech)', farmCode: 'farmi', userName: 'yamilus', password: 'Fpms@2026' },
        { group: 'System Administrator', label: 'Admin', farmCode: '', userName: 'admin', password: 'Fpms@2026' },
    ] as DevAccount[],
};

export interface DevAccount {
    group: string;
    label: string;
    farmCode: string;
    userName: string;
    password: string;
}
