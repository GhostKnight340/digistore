import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";

export type SupportAttachment = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type CreateSupportTicketInput = {
  category: string;
  subIssue: string;
  subIssueLabel: string;
  orderRef?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  attachments?: SupportAttachment[];
  customerId?: string | null;
};

function randomReference(): string {
  // GH-S-XXXXXX — same shape the design handoff shows to the customer.
  return `GH-S-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Create a ticket with a collision-safe public reference (unique column +
 *  retry). The reference is the id customers quote to support. */
export async function createSupportTicket(
  input: CreateSupportTicketInput,
): Promise<{ id: string; reference: string }> {
  await ensureDatabaseReady();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = randomReference();
    try {
      const ticket = await prisma.supportTicket.create({
        data: {
          reference,
          category: input.category,
          subIssue: input.subIssue,
          subIssueLabel: input.subIssueLabel,
          orderRef: input.orderRef ?? null,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          message: input.message ?? null,
          attachments: input.attachments?.length
            ? (input.attachments as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          customerId: input.customerId ?? null,
        },
        select: { id: true, reference: true },
      });
      return ticket;
    } catch (error) {
      // P2002 = reference collision — regenerate and retry.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Impossible de générer une référence de demande.");
}
