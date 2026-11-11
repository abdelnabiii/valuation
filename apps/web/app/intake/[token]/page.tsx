import type { Metadata } from "next";
import { resolveToken } from "@/lib/links";
import { loadIntake } from "@/lib/intake/server";
import { intakeConfig } from "@/lib/intake/config";
import { getBranding } from "@/lib/branding";
import IntakeForm from "@/components/intake/IntakeForm";

export const metadata: Metadata = { title: "Valuation questionnaire", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolveToken(token);
  const brand = await getBranding();
  if (!r.ok) {
    return (
      <main className="narrow">
        <h1>This link is not available</h1>
        <p className="muted">
          {r.reason === "expired" ? "The link has expired." : r.reason === "revoked" ? "The link has been replaced or withdrawn." : "The link is not valid."} Please contact{" "}
          {brand.advisorName}
          {brand.contactEmail ? ` at ${brand.contactEmail}` : ""} for a new one.
        </p>
      </main>
    );
  }
  const config = intakeConfig(r.engagement.profileKey);
  const state = await loadIntake(r.engagement.id, config);
  const base = `/api/intake/${encodeURIComponent(token)}`;
  return (
    <>
      <header className="intake-head" style={{ background: brand.primaryColor }}>
        <div className="narrow" style={{ maxWidth: 1200 }}>
          <p style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>{brand.firmName}</p>
          <h1>{r.clientName}: valuation questionnaire</h1>
          <p>Your answers save automatically. You can close this page and come back with the same link. Fields marked * are required.</p>
        </div>
      </header>
      <IntakeForm config={config} initial={state} saveUrl={base} uploadUrl={`${base}/upload`} submitUrl={`${base}/submit`} locked={r.link.locked} mode="client" />
      <footer className="narrow faint" style={{ fontSize: 12, paddingTop: 0 }}>
        {brand.footerText} Information you provide is used only for this valuation.
      </footer>
    </>
  );
}
