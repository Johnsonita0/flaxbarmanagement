import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, UsersRound, Wallet } from "lucide-react";
import { apiRequest } from "../lib/api";
import PageHeading from "../components/PageHeading";
import "../css/OperationsPages.css";

interface DepartmentOverview {
  department: { id: string; name: string };
  businessDate: string;
  staff: { id: string; name: string; role: string; clockedIn: boolean; clockIn: string | null; clockOut: string | null }[];
  sales: { id: string; sellerName: string; paymentMethod: string; total: number; createdAt: string; items: { name: string; quantity: number; total: number }[] }[];
  closures: {
    id: string;
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
  }[];
}

const money = (amount: number) => `₦${amount.toLocaleString()}`;
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

export default function DepartmentHubPage() {
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      setOverview(await apiRequest<DepartmentOverview>("/api/v1/department/overview"));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't load the department overview.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const timer = window.setInterval(() => { void loadOverview(false); }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadOverview]);

  const activeStaff = overview?.staff.filter((person) => person.clockedIn) ?? [];
  const salesTotal = overview?.sales.reduce((total, sale) => total + sale.total, 0) ?? 0;

  return (
    <section className="module-page">
      <PageHeading
        title={overview ? `${overview.department.name} team` : "Department hub"}
        description="Your staff on shift, completed sales, and submitted cash handovers."
        action={{ label: "Refresh", onClick: () => void loadOverview() }}
      />
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {loading && <p className="empty-state">Loading your department operations…</p>}
      {!loading && overview && <>
        <div className="metric-grid">
          <div className="metric-card metric-card--green"><small>Staff clocked in</small><strong>{activeStaff.length}</strong></div>
          <div className="metric-card metric-card--cash"><small>Sales today</small><strong>{money(salesTotal)}</strong></div>
          <div className="metric-card"><small>Transactions today</small><strong>{overview.sales.length}</strong></div>
          <div className="metric-card metric-card--amber"><small>Cash handovers</small><strong>{overview.closures.filter((item) => item.businessDate === overview.businessDate).length}</strong></div>
        </div>

        <section className="surface-card">
          <div className="surface-card__heading"><div><h2><UsersRound size={17} /> Department staff</h2><p>Today's attendance · {overview.businessDate}</p></div><span className="status-pill status-pill--neutral">{overview.staff.length} active accounts</span></div>
          {overview.staff.length === 0 ? <p className="empty-state">No active staff are assigned to this department.</p> : overview.staff.map((person) => (
            <div className="record-row" key={person.id}>
              <span className="record-date-icon"><Clock3 size={15} /></span>
              <span className="record-row__main"><strong>{person.name}</strong><small>{person.role.replaceAll("_", " ")} · {person.clockedIn ? `Clocked in ${dateTime(person.clockIn)}` : person.clockOut ? `Shift complete ${dateTime(person.clockOut)}` : "Not clocked in today"}</small></span>
              <span className={`status-pill${person.clockedIn ? "" : " status-pill--neutral"}`}>{person.clockedIn ? "On shift" : person.clockOut ? "Completed" : "Off shift"}</span>
            </div>
          ))}
        </section>

        <section className="surface-card">
          <div className="surface-card__heading"><div><h2>Sales flow</h2><p>Latest completed transactions in your department today.</p></div><span className="status-pill status-pill--neutral">{overview.sales.length}</span></div>
          {overview.sales.length === 0 ? <p className="empty-state">No sales have been completed today.</p> : overview.sales.map((sale) => (
            <div className="record-row" key={sale.id}>
              <span className="product-token"><Wallet size={17} /></span>
              <span className="record-row__main"><strong>{sale.sellerName}</strong><small>{dateTime(sale.createdAt)} · {sale.paymentMethod} · {sale.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</small></span>
              <strong className="record-row__meta">{money(sale.total)}</strong>
            </div>
          ))}
        </section>

        <section className="surface-card">
          <div className="surface-card__heading"><div><h2>Shift cash handovers</h2><p>Staff close balances and hand them to you for review.</p></div><span className="status-pill status-pill--neutral">{overview.closures.length}</span></div>
          {overview.closures.length === 0 ? <p className="empty-state">No shift cash handovers have been submitted yet.</p> : overview.closures.map((closure) => (
            <article className="handover-card" key={closure.id}>
              <div className="handover-card__heading"><div><strong>{closure.staffName} · {closure.businessDate}</strong><small>Closed {dateTime(closure.closedAt)} · Handed to {closure.handedToName ?? "department head"}</small></div><span className={`status-pill${closure.variance === 0 ? "" : " status-pill--warning"}`}>{closure.variance === 0 ? "Balanced" : `Variance ${money(closure.variance)}`}</span></div>
              <div className="reconciliation__values"><div><small>Expected cash</small><strong>{money(closure.expectedCash)}</strong></div><span>·</span><div><small>Counted cash</small><strong>{money(closure.actualCash)}</strong></div><div><small>Cash sales</small><strong>{money(closure.cashSales)}</strong></div></div>
              <small className="muted-copy">Opening {money(closure.openingCash)} · Cash received {money(closure.cashReceived)} · Paid out {money(closure.cashPaidOut)}</small>
              {closure.handoverNotes && <p className="stock-delivery-receipt">{closure.handoverNotes}</p>}
            </article>
          ))}
        </section>
        <button className="button button--outline" type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={15} /> Refresh department activity</button>
      </>}
    </section>
  );
}
