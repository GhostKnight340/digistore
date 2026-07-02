import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function adminEmail() {
  const fromArg = process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length);
  const email = fromArg || process.env.ADMIN_EMAIL || process.env.GHOST_ADMIN_EMAIL;
  return email?.trim().toLowerCase();
}

async function main() {
  const email = adminEmail();
  const role = process.argv.includes("--remove") ? "CUSTOMER" : "ADMIN";
  if (!email) {
    throw new Error("Provide --email=you@example.com or set ADMIN_EMAIL.");
  }

  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    throw new Error(`No existing customer account found for ${email}. Create/login as a customer first.`);
  }

  const updated = await prisma.customer.update({
    where: { email },
    data: { role },
    select: { id: true, email: true, role: true },
  });

  console.log(`Updated ${updated.email} (${updated.id}) to ${updated.role}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
