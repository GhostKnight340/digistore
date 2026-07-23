"use server";

/**
 * Server actions for the Launch Center (/admin/operations/launch-center).
 *
 * Admin-gated. The "audit" action simply recomputes readiness server-side and
 * revalidates the page (every check reads live state, so a re-render IS the
 * audit — there is no stored/faked score to mutate). Manual-task actions persist
 * through src/lib/ops/launchTasks. No secret is accepted or returned.
 */

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import type { ActionResult } from "@/lib/dto";
import { getLaunchReadiness, type LaunchReadiness } from "@/lib/ops/launchReadiness";
import {
  listManualTasks,
  createManualTask,
  updateManualTask,
  deleteManualTask,
  type ManualTask,
  type ManualTaskInput,
  type ManualTaskPatch,
} from "@/lib/ops/launchTasks";

const PATH = "/admin/operations/launch-center";

/** Re-run every automatic check and return the fresh snapshot. */
export async function runLaunchAuditAction(): Promise<
  ActionResult & { readiness?: LaunchReadiness }
> {
  await requireAdminCustomer();
  try {
    const readiness = await getLaunchReadiness();
    revalidatePath(PATH);
    return { ok: true, readiness };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Échec de l’audit." };
  }
}

export async function listManualTasksAction(): Promise<
  ActionResult & { tasks?: ManualTask[] }
> {
  await requireAdminCustomer();
  try {
    return { ok: true, tasks: await listManualTasks() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur." };
  }
}

export async function createManualTaskAction(
  input: ManualTaskInput,
): Promise<ActionResult & { tasks?: ManualTask[] }> {
  await requireAdminCustomer();
  if (!input?.title?.trim()) return { ok: false, error: "Un titre est requis." };
  try {
    const tasks = await createManualTask(input);
    revalidatePath(PATH);
    return { ok: true, tasks };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur." };
  }
}

export async function updateManualTaskAction(
  id: string,
  patch: ManualTaskPatch,
): Promise<ActionResult & { tasks?: ManualTask[] }> {
  await requireAdminCustomer();
  if (!id) return { ok: false, error: "Tâche introuvable." };
  try {
    const tasks = await updateManualTask(id, patch);
    revalidatePath(PATH);
    return { ok: true, tasks };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur." };
  }
}

export async function deleteManualTaskAction(
  id: string,
): Promise<ActionResult & { tasks?: ManualTask[] }> {
  await requireAdminCustomer();
  if (!id) return { ok: false, error: "Tâche introuvable." };
  try {
    const tasks = await deleteManualTask(id);
    revalidatePath(PATH);
    return { ok: true, tasks };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur." };
  }
}
