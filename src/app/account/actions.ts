"use server";

import { redirect } from "next/navigation";
import { logoutCustomerAction } from "@/app/actions/auth";

/** Shared by the desktop account sidebar and the mobile account drawer. */
export async function accountLogoutAction() {
  await logoutCustomerAction();
  redirect("/login");
}
