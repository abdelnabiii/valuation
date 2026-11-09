"use client";
import { useState, useTransition } from "react";
import { generateLink, revokeLinks, reopenIntake } from "@/app/admin/actions";

export default function LinkPanel({ id, active, locked, submittedAt, expiresAt, lastSavedAt }: { id: string; active: boolean; locked: boolean; submittedAt: string | null; expiresAt: string | null; lastSavedAt: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      {active ? (
        <p>
          A private link is active{expiresAt ? ` until ${expiresAt.slice(0, 10)}` : ""}.
          {lastSavedAt ? ` Client last saved ${lastSavedAt.slice(0, 16).replace("T", " ")}.` : " The client has not saved anything yet."}
          {locked && submittedAt ? ` Submitted ${submittedAt.slice(0, 10)}; the form is locked.` : ""}
        </p>
      ) : (
        <p className="muted">No active client link.</p>
      )}
      {url && (
        <div className="notice ok">
          <strong>Send this link to the client.</strong> It is shown only once; generating a new one replaces it.
          <div className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
            <input readOnly value={url} className="mono" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn small" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn" disabled={pending} onClick={() => start(async () => setUrl((await generateLink(id)).url))}>
          {active ? "Replace link" : "Create client link"}
        </button>
        {active && (
          <button className="btn danger" disabled={pending} onClick={() => confirm("Revoke the client link? The client will no longer be able to open the form.") && start(async () => { await revokeLinks(id); setUrl(null); })}>
            Revoke link
          </button>
        )}
        {locked && (
          <button className="btn secondary" disabled={pending} onClick={() => start(() => reopenIntake(id))}>
            Reopen for editing
          </button>
        )}
      </div>
    </div>
  );
}
