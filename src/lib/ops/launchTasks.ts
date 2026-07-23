/**
 * Manual launch tasks (server-only).
 *
 * Not everything can be auto-detected (buying supplier credits, verifying a bank
 * account, shooting Instagram content…). These live in a single JSON row of the
 * generic `StoreSetting` KV table — no dedicated model/migration — keyed
 * `launch_manual_tasks`. First read seeds a sensible default checklist.
 *
 * IDs are derived from the largest existing numeric id + 1 (no Math.random /
 * Date-based ids) so the store stays deterministic and test-friendly.
 */
import "server-only";

import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";

const KEY = "launch_manual_tasks";

export type ManualTaskPriority = "critical" | "recommended" | "optional";

export type ManualTask = {
  id: string;
  title: string;
  description: string;
  priority: ManualTaskPriority;
  /** ISO date (yyyy-mm-dd) or null. */
  dueDate: string | null;
  completed: boolean;
  notes: string;
  sortOrder: number;
};

const PRIORITIES: ManualTaskPriority[] = ["critical", "recommended", "optional"];

const DEFAULT_TASKS: Omit<ManualTask, "id" | "sortOrder">[] = [
  { title: "Créer la campagne Meta Ads", description: "Préparer et lancer la première campagne publicitaire Meta.", priority: "recommended", dueDate: null, completed: false, notes: "" },
  { title: "Acheter du crédit fournisseur", description: "Recharger le solde Reloadly / FazerCards pour la livraison automatique.", priority: "critical", dueDate: null, completed: false, notes: "" },
  { title: "Vérifier le compte bancaire", description: "Confirmer le RIB affiché aux clients et la réception d’un virement test.", priority: "critical", dueDate: null, completed: false, notes: "" },
  { title: "Revoir la tarification", description: "Contrôler les marges et prix publics avant l’ouverture des commandes.", priority: "recommended", dueDate: null, completed: false, notes: "" },
  { title: "Tester WhatsApp", description: "Vérifier que le numéro de support WhatsApp reçoit bien les messages.", priority: "recommended", dueDate: null, completed: false, notes: "" },
  { title: "Revue finale de l’UI", description: "Parcours complet du storefront sur mobile et desktop.", priority: "recommended", dueDate: null, completed: false, notes: "" },
  { title: "Préparer le contenu Instagram", description: "Visuels et légendes prêts pour l’annonce de lancement.", priority: "optional", dueDate: null, completed: false, notes: "" },
  { title: "Annonce de lancement", description: "Publier l’annonce de lancement sur les réseaux.", priority: "optional", dueDate: null, completed: false, notes: "" },
];

function coerceTask(raw: unknown, index: number): ManualTask | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;
  const priority = PRIORITIES.includes(r.priority as ManualTaskPriority)
    ? (r.priority as ManualTaskPriority)
    : "recommended";
  return {
    id: typeof r.id === "string" && r.id ? r.id : String(index + 1),
    title,
    description: typeof r.description === "string" ? r.description : "",
    priority,
    dueDate: typeof r.dueDate === "string" && r.dueDate ? r.dueDate : null,
    completed: r.completed === true,
    notes: typeof r.notes === "string" ? r.notes : "",
    sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : index,
  };
}

async function readRaw(): Promise<ManualTask[] | null> {
  const row = await prisma.storeSetting.findUnique({ where: { id: KEY } });
  if (!row) return null;
  if (!Array.isArray(row.value)) return [];
  return (row.value as unknown[])
    .map((v, i) => coerceTask(v, i))
    .filter((t): t is ManualTask => t !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

async function write(tasks: ManualTask[]): Promise<void> {
  const normalized = tasks.map((t, i) => ({ ...t, sortOrder: i }));
  await prisma.storeSetting.upsert({
    where: { id: KEY },
    update: { value: normalized },
    create: { id: KEY, value: normalized },
  });
}

/** Returns the task list, seeding the defaults on very first read. */
export async function listManualTasks(): Promise<ManualTask[]> {
  await ensureDatabaseReady();
  const existing = await readRaw();
  if (existing) return existing;
  const seeded: ManualTask[] = DEFAULT_TASKS.map((t, i) => ({ ...t, id: String(i + 1), sortOrder: i }));
  await write(seeded);
  return seeded;
}

function nextId(tasks: ManualTask[]): string {
  const max = tasks.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
  return String(max + 1);
}

export type ManualTaskInput = {
  title: string;
  description?: string;
  priority?: ManualTaskPriority;
  dueDate?: string | null;
  notes?: string;
};

export async function createManualTask(input: ManualTaskInput): Promise<ManualTask[]> {
  const tasks = await listManualTasks();
  const task: ManualTask = {
    id: nextId(tasks),
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    priority: input.priority && PRIORITIES.includes(input.priority) ? input.priority : "recommended",
    dueDate: input.dueDate?.trim() || null,
    completed: false,
    notes: input.notes?.trim() ?? "",
    sortOrder: tasks.length,
  };
  const next = [...tasks, task];
  await write(next);
  return next;
}

export type ManualTaskPatch = Partial<Omit<ManualTask, "id" | "sortOrder">>;

export async function updateManualTask(id: string, patch: ManualTaskPatch): Promise<ManualTask[]> {
  const tasks = await listManualTasks();
  const next = tasks.map((t) => {
    if (t.id !== id) return t;
    return {
      ...t,
      ...(typeof patch.title === "string" && patch.title.trim() ? { title: patch.title.trim() } : {}),
      ...(typeof patch.description === "string" ? { description: patch.description } : {}),
      ...(patch.priority && PRIORITIES.includes(patch.priority) ? { priority: patch.priority } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate?.trim() || null } : {}),
      ...(typeof patch.completed === "boolean" ? { completed: patch.completed } : {}),
      ...(typeof patch.notes === "string" ? { notes: patch.notes } : {}),
    };
  });
  await write(next);
  return next;
}

export async function deleteManualTask(id: string): Promise<ManualTask[]> {
  const tasks = await listManualTasks();
  const next = tasks.filter((t) => t.id !== id);
  await write(next);
  return next;
}
