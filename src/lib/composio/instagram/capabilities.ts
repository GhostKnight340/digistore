import "server-only";

/**
 * Instagram capability model.
 *
 * A "capability" is a Ghost.ma-level feature (read profile, list media, reply to
 * comments, publish, …). Each maps to exactly one Composio Instagram tool, but
 * the concrete tool *slug* varies by toolkit version, so we resolve slugs at
 * runtime by matching the toolkit's actual tool list against ordered keyword
 * patterns. This keeps the integration working across Composio version drift
 * without guessing outdated method names.
 *
 * Instagram Direct Messaging is deliberately absent — it needs extra Meta app
 * review and is out of scope (see the admin UI's disabled DM card).
 */

export const INSTAGRAM_CAPABILITIES = [
  "profile",
  "media",
  "mediaDetails",
  "comments",
  "commentReply",
  "commentModerate",
  "publish",
  "insights",
] as const;

export type InstagramCapability = (typeof INSTAGRAM_CAPABILITIES)[number];

/** Capabilities that only *read* — safe to run during connection verification. */
export const READ_CAPABILITIES: InstagramCapability[] = [
  "profile",
  "media",
  "mediaDetails",
  "comments",
  "insights",
];

/** Capabilities that perform a *public write* — always require admin confirmation. */
export const WRITE_CAPABILITIES: InstagramCapability[] = [
  "commentReply",
  "commentModerate",
  "publish",
];

interface CapabilityMatcher {
  /** Every group is a set of substrings that must ALL appear in the slug. */
  anyOf: string[][];
  /** Slugs containing any of these substrings are rejected (avoids false hits). */
  none?: string[];
}

/**
 * Ordered matchers per capability. Within a capability, the FIRST discovered
 * slug whose lowercased name satisfies a group wins (groups are tried in order,
 * so earlier groups are higher priority). All matched against slugs already
 * filtered to the Instagram toolkit.
 */
const MATCHERS: Record<InstagramCapability, CapabilityMatcher> = {
  profile: {
    anyOf: [
      ["get", "profile"],
      ["user", "info"],
      ["account", "info"],
      ["get", "me"],
      ["business", "account"],
    ],
    none: ["media", "comment", "insight", "story"],
  },
  media: {
    anyOf: [
      ["get", "user", "media"],
      ["list", "media"],
      ["get", "media", "list"],
      ["recent", "media"],
      ["user", "media"],
    ],
    none: ["comment", "insight", "child", "detail"],
  },
  mediaDetails: {
    anyOf: [
      ["get", "media", "detail"],
      ["get", "media", "by"],
      ["media", "info"],
      ["get", "single", "media"],
    ],
    none: ["comment", "insight", "list"],
  },
  comments: {
    anyOf: [
      ["get", "comment"],
      ["list", "comment"],
      ["media", "comment"],
    ],
    none: ["reply", "create", "delete", "hide"],
  },
  commentReply: {
    anyOf: [
      ["reply", "comment"],
      ["create", "comment", "reply"],
      ["comment", "reply"],
      ["create", "comment"],
    ],
    none: ["get", "list", "delete", "hide"],
  },
  commentModerate: {
    anyOf: [
      ["hide", "comment"],
      ["comment", "hide"],
      ["moderate", "comment"],
      ["delete", "comment"],
    ],
  },
  publish: {
    anyOf: [
      ["create", "media"],
      ["publish", "media"],
      ["create", "post"],
      ["publish", "post"],
      ["create", "photo"],
    ],
    none: ["comment", "reply"],
  },
  insights: {
    anyOf: [
      ["get", "insight"],
      ["media", "insight"],
      ["account", "insight"],
      ["get", "metrics"],
    ],
  },
};

/**
 * Given the toolkit's actual tool slugs, resolve a slug for each capability.
 * Missing capabilities are simply absent from the returned map.
 */
export function resolveCapabilitySlugs(slugs: string[]): Partial<Record<InstagramCapability, string>> {
  const lower = slugs.map((s) => ({ raw: s, low: s.toLowerCase() }));
  const out: Partial<Record<InstagramCapability, string>> = {};

  for (const cap of INSTAGRAM_CAPABILITIES) {
    const matcher = MATCHERS[cap];
    for (const group of matcher.anyOf) {
      const hit = lower.find(
        ({ low }) =>
          group.every((needle) => low.includes(needle)) &&
          !(matcher.none ?? []).some((bad) => low.includes(bad)),
      );
      if (hit) {
        out[cap] = hit.raw;
        break;
      }
    }
  }
  return out;
}

/** French label + short description for a capability (admin UI). */
export function capabilityLabel(cap: InstagramCapability): { label: string; write: boolean } {
  switch (cap) {
    case "profile":
      return { label: "Profil", write: false };
    case "media":
      return { label: "Publications", write: false };
    case "mediaDetails":
      return { label: "Détails des publications", write: false };
    case "comments":
      return { label: "Commentaires", write: false };
    case "commentReply":
      return { label: "Réponses aux commentaires", write: true };
    case "commentModerate":
      return { label: "Modération des commentaires", write: true };
    case "publish":
      return { label: "Publication automatique", write: true };
    case "insights":
      return { label: "Statistiques", write: false };
  }
}
