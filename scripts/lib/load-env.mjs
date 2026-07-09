// Dev/local env preloader for standalone scripts (tsx `--import`).
// Loads .env.local first, then .env as a fallback — matching Next.js dev
// precedence — and DELIBERATELY never touches .env.production.local. Production
// operations must go through scripts/prod-op.mjs, which loads that file
// explicitly. dotenv.config() does not override already-set vars, so
// .env.local wins over .env.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
