import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ReceiptText } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import PageHeading from "../components/PageHeading";
import { useToast } from "../components/ToastProvider";
import "../css/OperationsPages.css";

interface ShiftClosure {
  id: string;
  departmentName: string;
  staffName: string;
  handedToName: string | null;
  businessDate: string;
  openingCash: number;
  cashSales: number;
  cashReceived: number;
  cashPaidOut: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  handoverNotes: string | null;
  closedAt: string;
}

interface ClosureResponse {
  closures: ShiftClosure[];
  canClose: boolean;
  clockedIn: boolean;
  alreadyClosed: boolean;
  businessDate: string | null;
  cashSales: number;
  handedToName: string | null;
}

const money = (amount: number) => `₦${amount.toLocaleString()}`;
const closureTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function CashManagementPage({ user }: { user: CurrentUser }) {
  const { showToast } = useToast();
  const [data, setData] = useState<ClosureResponse | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [cashReceived, setCashReceived] = useState("0");
  const [cashPaidOut, setCashPaidOut] = useState("0");
  const [actualCash, setActualCash] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadClosures = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<ClosureResponse>("/api/v1/department/closures"));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load shift balances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadClosures(); }, [loadClosures]);

  const expected = useMemo(() => {
    const values = [openingCash, cashReceived, cashPaidOut].map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
    return values[0] + (data?.cashSales ?? 0) + values[1] - values[2];
  }, [cashPaidOut, cashReceived, data?.cashSales, openingCash]);

  async function submitClose() {
    const rawAmounts = [openingCash, cashReceived, cashPaidOut, actualCash];
    const amounts = rawAmounts.map((value) => Number(value));
    if (rawAmounts.some((value) => value.trim() === "") || amounts.some((value) => !Number.isFinite(value) || value < 0) || expected === null || expected < 0) {
      showToast("Enter valid non-negative cash amounts. Paid-out cash cannot exceed the available balance.", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/department/closures", {
        method: "POST",
        body: JSON.stringify({
          openingCash: amounts[0],
          cashReceived: amounts[1],
          cashPaidOut: amounts[2],
          actualCash: amounts[3],
          handoverNotes,
        }),
      });
      showToast(result.message, "success");
      setOpeningCash("");
      setCashReceived("0");
      setCashPaidOut("0");
      setActualCash("");
      setHandoverNotes("");
      await loadClosures();
    } catch (reason: unknown) {
      showToast(reason instanceof Error ? reason.message : "We couldn't save the shift close.", "error");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = data?.canClose === true && !loading;

  return (
    <section className="module-page">
      <PageHeading title="Cash & shift close" description="Balance your cash, submit the close, and hand it to your department head." />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading && <p className="empty-state">Loading cash and shift records…</p>}

      {!loading && data?.canClose && <>
        <div className="surface-card form-card">
          <div className="surface-card__heading"><div><h2><ReceiptText size={17} /> Close today's shift</h2><p>{data.businessDate} · Cash sales counted from completed transactions.</p></div></div>
          <div className="metric-grid">
            <div className="metric-card metric-card--green"><small>Recorded cash sales</small><strong>{money(data.cashSales)}</strong></div>
            <div className="metric-card"><small>Cash handover to</small><strong>{data.handedToName ?? "Department head"}</strong></div>
          </div>
          <div className="inventory-form-grid">
            <label>Opening cash balance (₦)<input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
            <label>Other cash received (₦)<input type="number" min="0" step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} /></label>
            <label>Cash paid out (₦)<input type="number" min="0" step="0.01" value={cashPaidOut} onChange={(event) => setCashPaidOut(event.target.value)} /></label>
            <label>Actual cash counted (₦)<input type="number" min="0" step="0.01" value={actualCash} onChange={(event) => setActualCash(event.target.value)} /></label>
          </div>
          <div className="reconciliation__values"><div><small>Expected cash</small><strong>{expected === null ? "—" : money(expected)}</strong></div><span>·</span><div><small>Difference</small><strong>{expected === null || !actualCash ? "—" : money(Number(actualCash) - expected)}</strong></div></div>
          <label>Handover notes (optional)<textarea maxLength={1000} value={handoverNotes} onChange={(event) => setHandoverNotes(event.target.value)} placeholder="Explain any cash difference or important handover detail." /></label>
          <p className="form-help">Expected = opening balance + your recorded cash sales + other cash received − cash paid out. A shift close can be submitted once per business day, before you clock out.</p>
          <button className="button button--primary" type="button" onClick={() => void submitClose()} disabled={!canSubmit || saving || openingCash === "" || actualCash === ""}><Check size={15} />{saving ? "Submitting close…" : "Submit shift close"}</button>
        </div>
      </>}

      {!loading && data && !data.canClose && !["super_admin", "management_admin"].includes(user.role) && (
        <div className="surface-card"><p className="empty-state">{data.alreadyClosed ? "Your shift close is already submitted for today." : !data.clockedIn ? "Clock in before you submit a shift close. Remember to close your balance before clocking out." : "Ask your administrator to assign an active department head before submitting your cash handover."}</p></div>
      )}

      {!loading && data && (user.role === "super_admin" || user.role === "management_admin") && (
        <div className="surface-card"><p className="empty-state">Administrator review mode · all department cash closures are listed below.</p></div>
      )}

      <section className="surface-card">
        <div className="surface-card__heading"><div><h2>Shift close history</h2><p>Submitted cash balances and department handovers.</p></div><button className="button button--outline" type="button" disabled={loading} onClick={() => void loadClosures()}>Refresh</button></div>
        {!loading && data?.closures.length === 0 ? <p className="empty-state">No shift cash closes have been recorded yet.</p> : data?.closures.map((closure) => (
          <div className="handover-card" key={closure.id}>
            <div className="handover-card__heading"><div><strong>{closure.staffName} · {closure.departmentName}</strong><small>{closure.businessDate} · {closureTime(closure.closedAt)} · Handed to {closure.handedToName ?? "department head"}</small></div><span className={`status-pill${closure.variance === 0 ? "" : " status-pill--warning"}`}>{closure.variance === 0 ? "Balanced" : `Variance ${money(closure.variance)}`}</span></div>
            <div className="reconciliation__values"><div><small>Expected</small><strong>{money(closure.expectedCash)}</strong></div><span>−</span><div><small>Counted</small><strong>{money(closure.actualCash)}</strong></div><div><small>Cash sales</small><strong>{money(closure.cashSales)}</strong></div></div>
            {closure.handoverNotes && <p className="stock-delivery-receipt">{closure.handoverNotes}</p>}
          </div>
        ))}
      </section>
    </section>
  );
}
