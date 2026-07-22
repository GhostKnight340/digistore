/**
 * Coverage readiness checklist (server-only).
 *
 * Before AI Support Coverage can be activated, the critical dependencies must be
 * healthy — an AI provider, the global switch + module, and a working ticket
 * system. A missing CRITICAL item blocks activation (you don't hand your shift
 * to an assistant that can't function). Non-critical items are shown as warnings
 * (e.g. inbound email not connected — web tickets still work without it).
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getAiOpsSettings, getModuleConfig } from "../store";
import { isProviderConfigured } from "../config";
import { isAiProvider } from "../types";
import { isInboundEmailConfigured } from "@/lib/support/inboundEmail";
import { SUPPORT_ASSISTANT_MODULE } from "./module";
import { gatherSupportKnowledge } from "./knowledge";

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  critical: boolean;
  detail?: string;
}

export interface CoverageReadiness {
  checks: ReadinessCheck[];
  canActivate: boolean;
}

export async function coverageReadiness(): Promise<CoverageReadiness> {
  const [settings, config, knowledge, inboxOk] = await Promise.all([
    getAiOpsSettings(),
    getModuleConfig(SUPPORT_ASSISTANT_MODULE),
    gatherSupportKnowledge().catch(() => null),
    prisma.supportTicket
      .count()
      .then(() => true)
      .catch(() => false),
  ]);

  const provider = config?.providerOverride ?? settings.defaultProvider;
  const providerOk = provider !== "mock" && provider !== "disabled" && isAiProvider(provider) && isProviderConfigured(provider);
  const knowledgeOk = !!knowledge && (knowledge.faq.length > 0 || !!knowledge.refundPolicy || knowledge.selfHelp.length > 0);

  const checks: ReadinessCheck[] = [
    { key: "provider", label: "Fournisseur IA configuré", ok: providerOk, critical: true, detail: provider },
    { key: "global", label: "IA globalement activée", ok: settings.globalEnabled, critical: true },
    { key: "module", label: "Module « Assistant support » activé", ok: config?.enabled ?? false, critical: true },
    { key: "inbox", label: "Système de tickets opérationnel", ok: inboxOk, critical: true },
    { key: "knowledge", label: "Base de connaissances disponible", ok: knowledgeOk, critical: false },
    { key: "policies", label: "Politique de remboursement chargée", ok: !!knowledge?.refundPolicy, critical: false },
    {
      key: "email",
      label: "Intégration e-mail entrante",
      ok: isInboundEmailConfigured(),
      critical: false,
      detail: isInboundEmailConfigured() ? "connectée" : "non configurée",
    },
  ];

  return { checks, canActivate: checks.filter((c) => c.critical).every((c) => c.ok) };
}
