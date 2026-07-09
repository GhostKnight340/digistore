// Entrypoint for generic Node.js bot hosts (Cybrancee / Pterodactyl egg) that
// launch the bot with `node index.js`. The Discord DM worker is written in
// TypeScript and normally run via `tsx` (see `npm run start:worker`). Register
// tsx's require hook here so plain Node can load the .ts worker, then start it.
//
// Local/other hosts should prefer `npm run start:worker` directly; this shim
// only exists so the `node index.js` egg can run the TypeScript worker.
require("tsx/cjs");
require("./scripts/discord-dm-worker.ts");
