/**
 * Discord assistant message routing — the PURE parser (no discord.js, no DB).
 *
 * Given the raw content of a message that mentioned the bot, decide whether it
 * is addressed to the CEO assistant and extract the question. Kept pure so the
 * routing rules are unit-testable without a Gateway connection.
 *
 * Rules (spec §6):
 *   - "@Ghost CEO <question>"  → CEO assistant, question = "<question>"
 *   - "@Ghost <question>"      → CEO assistant (default department)
 *   - "@Ghost Support …" / other known departments → ignored for now (null)
 *
 * Only the CEO department is implemented; every other department keyword is
 * recognized solely so we can deliberately ignore it (rather than treating the
 * keyword as part of a CEO question).
 */

/** Departments the bot knows about. Only "ceo" is handled; the rest are reserved. */
export const KNOWN_DEPARTMENTS = [
  "ceo",
  "support",
  "marketing",
  "supplier",
  "intelligence",
  "ads",
] as const;

export type Department = (typeof KNOWN_DEPARTMENTS)[number];

export type AssistantCommand = "reset" | "help";

export interface Routed {
  department: Department;
  question: string;
  /** A recognized command word ("reset"/"help") when the message is just that. */
  command?: AssistantCommand;
}

/**
 * Strips every leading Discord user/role mention (`<@123>`, `<@!123>`, `<@&123>`)
 * from the content and returns the remaining text, trimmed.
 */
export function stripLeadingMentions(content: string): string {
  return content.replace(/^(?:\s*<@[!&]?\d{17,20}>\s*)+/, "").trim();
}

/**
 * Parse a bot-mention message into a routing decision. Returns null when the
 * message is not for the CEO assistant (empty question, or addressed to another
 * department) — the caller should then stay silent.
 */
export function routeAssistantMessage(rawContent: string): Routed | null {
  const rest = stripLeadingMentions(rawContent ?? "");
  if (!rest) return null;

  // Peek at the first word to see if it names a department.
  const match = rest.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const firstWord = match[1].toLowerCase().replace(/[^a-z]/g, "");
  const remainder = (match[2] ?? "").trim();

  if ((KNOWN_DEPARTMENTS as readonly string[]).includes(firstWord)) {
    // Explicit department keyword.
    if (firstWord !== "ceo") return null; // other departments: ignored for now
    if (!remainder) return null; // "@Ghost CEO" with no question
    return withCommand("ceo", remainder);
  }

  // No department keyword → default to CEO, whole text is the question.
  return withCommand("ceo", rest);
}

/** Attach a recognized command ("reset"/"help") when the text is exactly that. */
function withCommand(department: Department, question: string): Routed {
  const word = question.trim().toLowerCase();
  if (word === "reset") return { department, question, command: "reset" };
  if (word === "help" || word === "aide") return { department, question, command: "help" };
  return { department, question };
}
