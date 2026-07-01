import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutCustomerAction } from "@/app/actions/auth";

async function logout() {
  "use server";
  await logoutCustomerAction();
  redirect("/login");
}

export default function AccountNav({ name, email }: { name: string; email: string }) {
  return (
    <aside className="h-fit">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-lg font-bold text-accent">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
        </div>
        <nav className="mt-5 space-y-1 text-sm">
          <Link href="/account" className="block rounded-lg px-3 py-2 text-muted hover:text-white">Tableau de bord</Link>
          <Link href="/account/orders" className="block rounded-lg px-3 py-2 text-muted hover:text-white">Commandes</Link>
          <Link href="/account/security" className="block rounded-lg px-3 py-2 text-muted hover:text-white">Securite</Link>
        </nav>
        <form action={logout}>
          <button className="btn-ghost mt-4 w-full" type="submit">Deconnexion</button>
        </form>
      </div>
    </aside>
  );
}
