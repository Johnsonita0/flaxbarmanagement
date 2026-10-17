import { useEffect, useMemo, useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface SalesReport {
  from: string;
  to: string;
  summary: { total: number; transactions: number };
  daily: { date: string; total: number; count: number }[];
  sales: { id: string; departmentName: string; sellerName: string; total: number; createdAt: string }[];
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

export default function ReportsPage({ user }: { user: CurrentUser }) {
  const isAdmin = user.role === "super_admin" || user.role === "management_admin";
  const initialTo = localDate(new Date());
  const initialFrom = localDate(new Date(Date.now() - 6 * 86_400_000));
  const [showFilters, setShowFilters] = useState(false);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [appliedRange, setAppliedRange] = useState({ from: initialFrom, to: initialTo });
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<SalesReport>(`/api/v1/sales/report?from=${appliedRange.from}&to=${appliedRange.to}`)
      .then((result) => { if (active) setReport(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "We couldn't load the sales report.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appliedRange, isAdmin]);

  const maxDailyTotal = useMemo(() => Math.max(1, ...((report?.daily ?? []).map((day) => day.total))), [report]);
  return (
    <section className="module-page">
      <PageHeading
        title="Reports"
        description={isAdmin ? "Review completed sales and business performance." : "Sales reporting is available to administrator accounts."}
        action={isAdmin ? { label: "Filters", onClick: () => setShowFilters((open) => !open) } : undefined}
      />
      {isAdmin && showFilters && <form className="surface-card form-card report-filters" onSubmit={(event) => {
        event.preventDefault();
        if (from > to) {
          setError("The start date must be before the end date.");
          return;
        }
        setAppliedRange({ from, to });
        setError("");
        setShowFilters(false);
      }}>
        <div className="surface-card__heading"><h2><Filter size={15} /> Filter reports</h2><button type="button" onClick={() => setShowFilters(false)}>Close</button></div>
        <label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} required /></label>
        <div className="form-actions"><button className="button button--outline" type="button" onClick={() => { setFrom(initialFrom); setTo(initialTo); setAppliedRange({ from: initialFrom, to: initialTo }); }}>Last 7 days</button><button className="button button--primary" type="submit">Apply filters</button></div>
      </form>}
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {!isAdmin
        ? <div className="surface-card feature-unavailable" role="status"><div><h2>Administrator access required</h2><p>Sales report records are restricted to administrator accounts.</p></div></div>
        : <section className="surface-card reports-list">
        <div className="surface-card__heading">
          <div><h2>Sales performance</h2><p>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${appliedRange.from}T12:00:00Z`))} – {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${appliedRange.to}T12:00:00Z`))}</p></div>
          <button className="button button--outline" type="button" onClick={() => setAppliedRange({ ...appliedRange })} disabled={loading}><RefreshCw size={14} />Refresh</button>
        </div>
        {loading && !report ? <p className="empty-state">Loading sales report…</p> : <>
          {report && <div className="sales-report-summary">
            <div className="sales-report-metric"><span>Completed sales</span><strong>{money(report.summary.total)}</strong></div>
            <div className="sales-report-metric"><span>Transactions</span><strong>{report.summary.transactions.toLocaleString()}</strong></div>
          </div>}
          {report && report.daily.length > 0 ? <div className="sales-report-chart" aria-label="Daily sales totals">
            {report.daily.map((day) => <div className="sales-report-bar" key={day.date} title={`${day.date}: ${money(day.total)} across ${day.count} sales`}>
              <span style={{ height: `${Math.max(5, day.total / maxDailyTotal * 125)}px` }} />
              <small>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</small>
            </div>)}
          </div> : report && <p className="empty-state">No sales were completed in this date range.</p>}
          {report && <div className="sales-report-transactions">
            <div className="surface-card__heading"><div><h3>Latest transactions</h3><p>Most recent completed sales in the selected period</p></div><span className="status-pill status-pill--neutral">{report.sales.length}</span></div>
            {report.sales.length === 0 ? <p className="empty-state">No completed transactions to show.</p> : report.sales.map((sale) => <div className="record-row" key={sale.id}>
              <span className="product-token">₦</span>
              <span className="record-row__main"><strong>{sale.departmentName} · {sale.sellerName}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sale.createdAt))}</small></span>
              <strong className="record-row__meta">{money(sale.total)}</strong>
            </div>)}
          </div>}
        </>}
      </section>}
    </section>
  );
}
