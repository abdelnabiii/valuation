import { redirect } from "next/navigation";
import { verifyLogin } from "@/lib/auth";

export const metadata = { title: "Sign in" };

async function login(formData: FormData) {
  "use server";
  const r = await verifyLogin(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (r.ok) redirect("/admin");
  redirect(`/admin/login?e=${encodeURIComponent(r.error)}`);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="narrow" style={{ maxWidth: 380, paddingTop: 96 }}>
      <h1>Sign in</h1>
      <p className="muted">Valuation advisory platform</p>
      {e && <p className="notice bad">{e}</p>}
      <form action={login} className="panel" style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn" type="submit">Sign in</button>
      </form>
    </main>
  );
}
