-- Move the Discord Business Assistant off OpenRouter and onto the global AI
-- provider (now the admin's own Anthropic Haiku key), so it stops hitting
-- OpenRouter's free-tier 429 rate limit. The Anthropic adapter fully supports
-- the assistant's multi-turn tool-calling loop (tool_use/tool_result blocks) and
-- automatic prompt caching, so nothing is lost by the switch.
--
-- Guarded: only the row still pinned to `openrouter` is changed, so a deliberate
-- future override is never clobbered. Clearing both overrides makes the module
-- inherit AiOpsSettings.defaultProvider / defaultModel. Strictly a config
-- backfill (no schema change); safe to re-run.

UPDATE "AiModuleConfig"
SET "providerOverride" = NULL,
    "modelOverride" = NULL
WHERE module = 'discord_assistant'
  AND "providerOverride" = 'openrouter';
