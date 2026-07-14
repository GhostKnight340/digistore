"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listMilestones,
  getMilestoneDetail,
  saveMilestone,
  setMilestoneActive,
  archiveMilestone,
  duplicateMilestone,
  reorderMilestones,
} from "@/lib/db/milestones";
import type { ActionResult, AdminMilestoneDTO, AdminMilestoneDetailDTO, SaveMilestoneInput } from "@/lib/dto";

function revalidate() {
  revalidatePath("/admin");
}

export async function getMilestonesAction(): Promise<AdminMilestoneDTO[]> {
  await requireAdminCustomer();
  return listMilestones();
}

export async function getMilestoneDetailAction(id: string): Promise<AdminMilestoneDetailDTO | null> {
  await requireAdminCustomer();
  return getMilestoneDetail(id);
}

export async function saveMilestoneAction(input: SaveMilestoneInput): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdminCustomer();
  const result = await saveMilestone(input, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function setMilestoneActiveAction(id: string, active: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await setMilestoneActive(id, active);
  if (result.ok) revalidate();
  return result;
}

export async function archiveMilestoneAction(id: string, archived: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await archiveMilestone(id, archived);
  if (result.ok) revalidate();
  return result;
}

export async function duplicateMilestoneAction(id: string): Promise<ActionResult & { id?: string }> {
  const admin = await requireAdminCustomer();
  const result = await duplicateMilestone(id, admin.name);
  if (result.ok) revalidate();
  return result;
}

export async function reorderMilestonesAction(orderedIds: string[]): Promise<ActionResult> {
  await requireAdminCustomer();
  const result = await reorderMilestones(orderedIds);
  if (result.ok) revalidate();
  return result;
}
