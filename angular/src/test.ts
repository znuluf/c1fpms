// This project currently tests framework-independent FPMS helpers.
// No current spec uses Angular TestBed, and the application does not load
// Zone.js. Avoid initializing TestBed here so Karma can execute the specs
// without introducing an unused runtime dependency.

declare const __karma__: any;
declare const require: any;

// Prevent Karma from starting before the spec modules have been loaded.
__karma__.loaded = function () {};

const context = require.context('./', true, /\.spec\.ts$/);
context.keys().forEach(context);

__karma__.start();
