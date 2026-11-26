// These specs exercise framework-independent FPMS helpers; they do not need Angular TestBed
// or Zone.js. Let Karma's own client bootstrap/start lifecycle run after this entry point loads.
const context = (require as any).context('./', true, /\.spec\.ts$/);
context.keys().forEach(context);
