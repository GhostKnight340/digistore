import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

/**
 * Sentry build-time wiring (source maps + the tunnel route). Everything here is
 * inert without credentials: with no SENTRY_AUTH_TOKEN the upload step is
 * skipped, and with no DSN the runtime SDK never initialises (see
 * src/instrumentation.ts and src/instrumentation-client.ts). The build must
 * succeed unchanged when none of these variables are set — that is the current
 * state, and it is deliberate.
 *
 * SENTRY_AUTH_TOKEN is BUILD-TIME ONLY and must never be exposed to the client.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only upload source maps when we actually have a token to do it with.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  // Routes browser events through our own domain so ad blockers don't eat them.
  tunnelRoute: "/monitoring",
  // Drop the SDK's debug logging from the production bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
  telemetry: false,
});
