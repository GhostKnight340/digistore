import type { EmailModule } from "@/lib/email/composerModules";

export type { EmailModule };

/** A recipient chosen in the composer (existing account or manual address). */
export type ClientRecipient = {
  customerId: string | null;
  email: string;
  name: string;
  status?: string;
  emailVerified?: boolean;
  creditBalanceMad?: number;
  orderCount?: number;
  /** Set for a manual address that matches an existing account. */
  matchedAccount?: { id: string; name: string; status: string } | null;
};

export type ComposerPermissions = {
  view: boolean;
  compose: boolean;
  send: boolean;
  creditGrant: boolean;
};

export type ComposerState = {
  templateKey: string;
  recipientMode: "existing" | "manual";
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  recipients: ClientRecipient[];
  modules: EmailModule[];
};

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m_${Math.random().toString(36).slice(2)}`;
  }
}
