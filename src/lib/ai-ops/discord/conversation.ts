/**
 * Per-thread conversation memory — PURE (no discord.js, no DB, no timers).
 *
 * The assistant keeps short-term context so follow-up questions inside the same
 * Discord thread stay coherent (spec §7). Context is scoped to a single thread
 * id: two threads — and therefore two users or two channels — never share
 * history. Inactive threads expire after a TTL so memory (and the model's
 * context window) stay bounded.
 *
 * Time is injected (`now`) so the store is deterministic and unit-testable; the
 * worker passes `Date.now()`. State lives in the long-running worker process,
 * never in a serverless request, so an in-memory Map is the right home.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface ThreadState {
  turns: ConversationTurn[];
  lastActivity: number;
}

export interface ConversationStoreOptions {
  /** Drop a thread after this many ms of inactivity. Default 30 min. */
  ttlMs?: number;
  /** Keep at most this many recent turns per thread. Default 10. */
  maxTurns?: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_TURNS = 10;

export class ConversationStore {
  private readonly threads = new Map<string, ThreadState>();
  private readonly ttlMs: number;
  private readonly maxTurns: number;

  constructor(options: ConversationStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  }

  /** The recent history for a thread (empty if new or expired). */
  history(threadId: string, now: number = Date.now()): ConversationTurn[] {
    const state = this.threads.get(threadId);
    if (!state) return [];
    if (now - state.lastActivity > this.ttlMs) {
      this.threads.delete(threadId);
      return [];
    }
    return state.turns.slice();
  }

  /** Append a turn to a thread, refreshing its activity and trimming history. */
  append(threadId: string, turn: ConversationTurn, now: number = Date.now()): void {
    // Reading first drops the thread if it had already expired, so a stale
    // thread never resurrects with old turns still attached.
    const turns = this.history(threadId, now);
    turns.push(turn);
    this.threads.set(threadId, {
      turns: turns.slice(-this.maxTurns),
      lastActivity: now,
    });
  }

  /** Whether the store is tracking a (non-expired) thread. */
  has(threadId: string, now: number = Date.now()): boolean {
    return this.history(threadId, now).length > 0;
  }

  /** Forget a thread explicitly (e.g. an error we don't want remembered). */
  clear(threadId: string): void {
    this.threads.delete(threadId);
  }

  /** Remove every expired thread. Cheap; call opportunistically. */
  prune(now: number = Date.now()): void {
    for (const [id, state] of this.threads) {
      if (now - state.lastActivity > this.ttlMs) this.threads.delete(id);
    }
  }

  /** Number of live threads (for logging/tests). */
  size(now: number = Date.now()): number {
    this.prune(now);
    return this.threads.size;
  }
}
