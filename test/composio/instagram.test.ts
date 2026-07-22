import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveCapabilitySlugs } from "../../src/lib/composio/instagram/capabilities";
import { mapComposioStatus } from "../../src/lib/composio/instagram/status";
import {
  deriveIdempotencyKey,
  validatePublish,
  validateReply,
} from "../../src/lib/composio/instagram/validation";
import { normalizeComposioError } from "../../src/lib/composio/server";

test("Composio account statuses fail closed into Ghost integration statuses", () => {
  assert.equal(mapComposioStatus("ACTIVE"), "CONNECTED");
  assert.equal(mapComposioStatus("EXPIRED"), "EXPIRED");
  assert.equal(mapComposioStatus("REVOKED"), "REAUTH_REQUIRED");
  assert.equal(mapComposioStatus("FAILED"), "REAUTH_REQUIRED");
  assert.equal(mapComposioStatus("SOMETHING_NEW"), "ERROR");
});

test("capability discovery maps the REAL toolkit slugs and doesn't confuse variants", () => {
  // Real INSTAGRAM_* slugs (from the Composio toolkit). Key traps:
  //  - profile must be GET_USER_INFO, NOT GET_MESSENGER_PROFILE (a DM tool that
  //    also contains "get"+"profile" and requires ig_user_id).
  //  - mediaDetails (single media) must be GET_IG_MEDIA, NOT the GET_IG_USER_MEDIA
  //    list nor the comments/insights/children variants.
  const resolved = resolveCapabilitySlugs([
    "INSTAGRAM_GET_USER_INFO",
    "INSTAGRAM_GET_MESSENGER_PROFILE",
    "INSTAGRAM_GET_IG_USER_MEDIA",
    "INSTAGRAM_GET_IG_MEDIA",
    "INSTAGRAM_GET_IG_MEDIA_CHILDREN",
    "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
    "INSTAGRAM_REPLY_TO_COMMENT",
    "INSTAGRAM_DELETE_COMMENT",
  ]);
  assert.equal(resolved.profile, "INSTAGRAM_GET_USER_INFO");
  assert.equal(resolved.media, "INSTAGRAM_GET_IG_USER_MEDIA");
  assert.equal(resolved.mediaDetails, "INSTAGRAM_GET_IG_MEDIA");
  assert.equal(resolved.comments, "INSTAGRAM_GET_IG_MEDIA_COMMENTS");
  assert.equal(resolved.commentReply, "INSTAGRAM_REPLY_TO_COMMENT");
  assert.equal(resolved.commentModerate, "INSTAGRAM_DELETE_COMMENT");
});

test("public-write validation rejects unsafe or oversized payloads", () => {
  assert.equal(validateReply({ commentId: "", message: "hello" }).ok, false);
  assert.equal(validateReply({ commentId: "comment-1", message: "x".repeat(2201) }).ok, false);
  assert.equal(validatePublish({ imageUrl: "http://example.com/a.jpg", caption: "" }).ok, false);
  assert.equal(validatePublish({ imageUrl: "https://example.com/a.gif", caption: "" }).ok, false);
  assert.equal(validatePublish({ imageUrl: "https://example.com/a.jpg?sig=1", caption: "ok" }).ok, true);
});

test("idempotency keys are deterministic and scoped to actor, token, and payload", () => {
  const first = deriveIdempotencyKey("admin-1", ["publish", "image", "caption"], "token-1");
  assert.equal(first, deriveIdempotencyKey("admin-1", ["publish", "image", "caption"], "token-1"));
  assert.notEqual(first, deriveIdempotencyKey("admin-2", ["publish", "image", "caption"], "token-1"));
  assert.notEqual(first, deriveIdempotencyKey("admin-1", ["publish", "image", "caption"], "token-2"));
});

test("normalized errors never expose raw Composio messages", () => {
  const secret = "https://internal.example/oauth?token=super-secret";
  const normalized = normalizeComposioError(new TypeError(`fetch failed ${secret}`));
  assert.equal(normalized.code, "network");
  assert.doesNotMatch(normalized.message, /super-secret|internal\.example/);
  assert.doesNotMatch(normalized.logHint, /super-secret|internal\.example/);
});

test("Instagram writes acquire a database claim before executing Composio", () => {
  const service = readFileSync("src/lib/composio/instagram/service.ts", "utf8");
  const reply = service.slice(service.indexOf("export async function replyToComment"), service.indexOf("export async function publishMedia"));
  const publish = service.slice(service.indexOf("export async function publishMedia"), service.indexOf("export async function disconnectOrUnlink"));
  assert.ok(reply.indexOf("claimAction(") < reply.indexOf("execTool("));
  assert.ok(publish.indexOf("claimAction(") < publish.indexOf("execTool("));

  const store = readFileSync("src/lib/composio/instagram/store.ts", "utf8");
  assert.match(store, /instagramActionRecord\.create/);
  assert.match(store, /error\.code !== "P2002"/);
  assert.match(store, /status: "PENDING", updatedAt:/);
});
