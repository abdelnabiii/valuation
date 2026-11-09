import { loadIntake } from "@/lib/intake/server";
import IntakeForm from "@/components/intake/IntakeForm";

export default async function AdminIntake({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadIntake(id);
  return (
    <>
      <p className="muted">You can view and correct anything the client entered. Every change is recorded in the audit trail under your name.</p>
      <div style={{ margin: "0 -20px" }}>
        <IntakeForm initial={state} saveUrl={`/api/admin/engagements/${id}/intake`} uploadUrl={`/api/admin/engagements/${id}/upload`} mode="admin" />
      </div>
    </>
  );
}
