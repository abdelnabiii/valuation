import Link from "next/link";
import { eq } from "drizzle-orm";
import { CATALOGUE, PROFILES, getProfile, isRelevant } from "@valuation/engine";
import { SECTION_LABELS } from "@valuation/exports";
import { db, profileDefault } from "@/lib/db";
import ProfileDefaultsEditor, { type DefaultRow } from "@/components/admin/ProfileDefaultsEditor";

export const metadata = { title: "Industry profiles" };

export default async function Profiles({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p: pk } = await searchParams;
  const p = getProfile(pk);
  const edited = await db().select().from(profileDefault).where(eq(profileDefault.profileKey, p.key));
  const rows: DefaultRow[] = CATALOGUE.filter((c) => c.kind !== "market" && isRelevant(c.key, p.model, p.methods) && (c.default !== undefined || p.defaults[c.key] !== undefined || c.key.startsWith("rec.w_")))
    .map((c) => ({
      key: c.key,
      label: c.label,
      unit: c.unit,
      builtIn: p.defaults[c.key] ?? c.default ?? null,
      edited: (() => {
        const e = edited.find((x) => x.assumptionKey === c.key);
        return e ? Number(e.value) : null;
      })(),
      group: SECTION_LABELS[c.section] ?? c.section,
    }));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Industry profiles</h1>
          <p className="muted">Each profile sets the questionnaire, forecast model, methods and default assumptions. Defaults you set here apply to every engagement using the profile, and still show as unconfirmed until you confirm them on the engagement.</p>
        </div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "260px 1fr" }}>
        <nav className="panel" style={{ padding: 12 }}>
          {[...new Set(PROFILES.map((x) => x.family))].map((f) => (
            <div key={f} style={{ marginBottom: 10 }}>
              <div className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{f}</div>
              {PROFILES.filter((x) => x.family === f).map((x) => (
                <div key={x.key}>
                  <Link href={`/admin/settings/profiles?p=${x.key}`} style={{ fontWeight: x.key === p.key ? 600 : 400 }}>{x.label.split(" (")[0]}</Link>
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="panel">
          <h2>{p.label}</h2>
          <p className="muted">{p.description} Forecast model: <strong>{p.model.replace("_", " ")}</strong>. Methods: {p.methods.join(", ").replace("income_cap", "income capitalisation")}.</p>
          <ProfileDefaultsEditor key={p.key} profileKey={p.key} rows={rows} />
        </div>
      </div>
    </>
  );
}
