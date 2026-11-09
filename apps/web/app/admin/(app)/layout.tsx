import Link from "next/link";
import { requireAdmin, destroySession } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  const b = await getBranding();
  return (
    <div className="shell">
      <aside className="sidebar" style={{ background: b.primaryColor }}>
        <Link href="/admin" className="brand">{b.firmName}</Link>
        <nav>
          <Link href="/admin">Engagements</Link>
          <Link href="/admin/settings">Settings</Link>
          <Link href="/admin/checklist">Pre-send checklist</Link>
        </nav>
        <div className="foot">
          <div>{s.email}</div>
          <form action={logout}>
            <button className="btn small secondary" style={{ marginTop: 8 }}>Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
