import { getBranding } from "@/lib/branding";
import { saveBranding, changePasswordAction } from "../../actions";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams;
  const b = await getBranding();
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><p className="muted">Your branding appears on the client form, the Excel model, the report and the deck.</p></div></div>
      {e && <p className="notice bad">{e}</p>}
      {ok && <p className="notice ok">{ok === "password" ? "Password changed." : "Saved."}</p>}
      <div className="panel" style={{ maxWidth: 820 }}>
        <h2>Branding</h2>
        <form action={saveBranding} encType="multipart/form-data">
          <div className="grid2">
            <div className="field"><label htmlFor="advisor_name">Your name</label><input id="advisor_name" name="advisor_name" defaultValue={b.advisorName} /></div>
            <div className="field"><label htmlFor="firm_name">Practice name</label><input id="firm_name" name="firm_name" defaultValue={b.firmName} /></div>
            <div className="field"><label htmlFor="contact_email">Contact email (shown to clients)</label><input id="contact_email" name="contact_email" type="email" defaultValue={b.contactEmail ?? ""} /></div>
            <div className="field">
              <label htmlFor="typeface">Typeface</label>
              <select id="typeface" name="typeface" defaultValue={b.typeface}>
                {["IBM Plex Sans", "Calibri", "Arial", "Georgia", "Garamond", "Cambria"].map((f) => <option key={f}>{f}</option>)}
              </select>
              <div className="help">Office files fall back to Arial if the typeface is not a standard Office font.</div>
            </div>
            <div className="field"><label htmlFor="primary_color">Primary colour</label><input id="primary_color" name="primary_color" type="color" defaultValue={b.primaryColor} /></div>
            <div className="field"><label htmlFor="accent_color">Accent colour</label><input id="accent_color" name="accent_color" type="color" defaultValue={b.accentColor} /></div>
            <div className="field"><label htmlFor="neutral_color">Neutral colour</label><input id="neutral_color" name="neutral_color" type="color" defaultValue={b.neutralColor} /></div>
            <div className="field"><label htmlFor="logo">Logo (PNG, under 2 MB)</label><input id="logo" name="logo" type="file" accept="image/png" />{b.logoUrl && <div className="help">A logo is on file.</div>}</div>
          </div>
          <div className="field"><label htmlFor="footer_text">Footer text</label><input id="footer_text" name="footer_text" defaultValue={b.footerText} /></div>
          <div className="field">
            <label htmlFor="disclaimer_text">Disclaimer</label>
            <textarea id="disclaimer_text" name="disclaimer_text" rows={5} defaultValue={b.disclaimerText} />
            <div className="help">Must state that this is an advisory valuation and not a certified valuation by a licensed valuer.</div>
          </div>
          <button className="btn" type="submit">Save branding</button>
        </form>
      </div>
      <div className="panel" style={{ maxWidth: 520 }}>
        <h2>Change password</h2>
        <form action={changePasswordAction}>
          <div className="field"><label htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="next">New password (12+ characters)</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required /></div>
          <div className="field"><label htmlFor="confirm">Repeat new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
          <button className="btn" type="submit">Change password</button>
        </form>
      </div>
    </>
  );
}
