// This project currently tests framework-independent FPMS helpers.
// No current spec uses Angular TestBed, and the application does not load
// Zone.js. Avoid initializing TestBed so Karma can execute the specs directly.

declare const __karma__: any;

// Prevent Karma from starting before the spec modules have been loaded.
__karma__.loaded = function () {};

// Webpack provides require.context; use the existing NodeJS require typing
// rather than redeclaring the global require symbol.
const context = (require as any).context('./', true, /\.spec\.ts$/);
context.keys().forEach(context);

__karma__.start();
