import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/auth";

export async function GET() {
  const customer = await getCurrentCustomer().catch(() => null);
  return NextResponse.json({
    customer: customer ? { name: customer.name, email: customer.email } : null,
  });
}
