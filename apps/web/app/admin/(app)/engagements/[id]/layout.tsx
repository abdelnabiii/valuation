import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { client, db, engagement } from "@/lib/db";
import Tabs from "@/components/admin/Tabs";

export default async function EngagementLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db().select({ e: engagement, c: client }).from(engagement).innerJoin(client, eq(client.id, engagement.clientId)).where(eq(engagement.id, id));
  if (!row) notFound();
  const base = `/admin/engagements/${id}`;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {row.c.isDemo ? "Demo client · fictional data" : "Client"}
          </p>
          <h1>{row.c.name}</h1>
          <p className="muted">
            {row.e.title}
            {row.e.valuationDate ? ` · valuation date ${row.e.valuationDate}` : ""}
          </p>
        </div>
      </div>
      <Tabs
        base={base}
        tabs={[
          { href: "", label: "Overview" },
          { href: "/intake", label: "Intake" },
          { href: "/uploads", label: "Uploads" },
          { href: "/assumptions", label: "Assumptions" },
          { href: "/comparables", label: "Comparables" },
          { href: "/valuation", label: "Valuation" },
          { href: "/open-items", label: "Open items" },
          { href: "/exports", label: "Exports" },
          { href: "/audit", label: "Audit trail" },
        ]}
      />
      {children}
    </>
  );
}
