import { CHECKLIST } from "@/lib/checklist";

export const metadata = { title: "Pre-send checklist" };

export default function Checklist() {
  return (
    <>
      <div className="page-head"><div><h1>Pre-send checklist</h1><p className="muted">Verify each point before a report, model or deck goes to a client.</p></div></div>
      <div className="stack" style={{ maxWidth: 820 }}>
        {CHECKLIST.map((g) => (
          <div className="panel" key={g.title}>
            <h2>{g.title}</h2>
            {g.items.map((it, i) => (
              <label key={i} className="row" style={{ fontWeight: 400, alignItems: "flex-start", flexWrap: "nowrap", marginBottom: 10 }}>
                <input type="checkbox" style={{ marginTop: 4 }} /> <span>{it}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
