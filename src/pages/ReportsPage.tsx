import { useEffect, useMemo, useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import type { CurrentUser } from "../lib/api";
import { apiRequest } from "../lib/api";
import PageHeading from "../components/PageHeading";
import "./../css/OperationsPages.css";

interface SalesReport {
  from: string;
  to: string;
  summary: { total: number; transactions: number; expenditure: number; cogs: number; grossProfit: number; costCoverage: number; netCashFlow: number };
  daily: { date: string; total: number; count: number; expenditure: number; cogs: number; grossProfit: number }[];
  projection: { days: number; sales: number; expenditure: number; grossProfit: number; netCashFlow: number };
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

function currentMonthRange() {
  const now = new Date();
  return {
    from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDate(now),
  };
}

function currentYearRange() {
  const now = new Date();
  return { from: `${now.getFullYear()}-01-01`, to: localDate(now) };
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

  const chartData = useMemo(() => {
    const days = report?.daily ?? [];
    if (days.length <= 31) return days;
    const months = new Map<string, typeof days[number]>();
    for (const day of days) {
      const month = day.date.slice(0, 7);
      const current = months.get(month) ?? { date: `${month}-01`, total: 0, count: 0, expenditure: 0, cogs: 0, grossProfit: 0 };
      current.total += day.total;
      current.count += day.count;
      current.expenditure += day.expenditure;
      current.cogs += day.cogs;
      current.grossProfit += day.grossProfit;
      months.set(month, current);
    }
    return [...months.values()];
  }, [report]);
  const isMonthlyChart = (report?.daily.length ?? 0) > 31;
  const maxChartValue = useMemo(() => Math.max(1, ...chartData.flatMap((day) => [day.total, day.expenditure, day.grossProfit])), [chartData]);
  const projectionMetrics = report ? [
    { label: "Sales", value: report.projection.sales, className: "sales-projection-chart__revenue" },
    { label: "Vendor payments", value: report.projection.expenditure, className: "sales-projection-chart__expenditure" },
    { label: "Gross profit", value: report.projection.grossProfit, className: "sales-projection-chart__profit" },
    { label: "Net cash flow", value: report.projection.netCashFlow, className: "sales-projection-chart__cash" },
  ] : [];
  const maxProjectionValue = Math.max(1, ...projectionMetrics.map((metric) => metric.value));
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
        <div className="form-actions report-range-shortcuts">
          <button className="button button--outline" type="button" onClick={() => { const range = { from: initialTo, to: initialTo }; setFrom(range.from); setTo(range.to); setAppliedRange(range); }}>Today</button>
          <button className="button button--outline" type="button" onClick={() => { const range = currentMonthRange(); setFrom(range.from); setTo(range.to); setAppliedRange(range); }}>This month</button>
          <button className="button button--outline" type="button" onClick={() => { const range = currentYearRange(); setFrom(range.from); setTo(range.to); setAppliedRange(range); }}>This year</button>
          <button className="button button--outline" type="button" onClick={() => { setFrom(initialFrom); setTo(initialTo); setAppliedRange({ from: initialFrom, to: initialTo }); }}>Last 7 days</button>
          <button className="button button--primary" type="submit">Apply custom range</button>
        </div>
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
            <div className="sales-report-metric"><span>Sales revenue</span><strong>{money(report.summary.total)}</strong></div>
            <div className="sales-report-metric"><span>Vendor payments</span><strong>{money(report.summary.expenditure)}</strong></div>
            <div className="sales-report-metric"><span>Estimated gross profit (costed sales)</span><strong>{money(report.summary.grossProfit)}</strong></div>
            <div className="sales-report-metric"><span>Cost of goods sold</span><strong>{money(report.summary.cogs)}</strong></div>
            <div className="sales-report-metric"><span>Sales with recorded cost</span><strong>{Math.round(report.summary.costCoverage * 100)}%</strong></div>
            <div className="sales-report-metric"><span>Net cash flow</span><strong>{money(report.summary.netCashFlow)}</strong></div>
            <div className="sales-report-metric"><span>Transactions</span><strong>{report.summary.transactions.toLocaleString()}</strong></div>
          </div>}
          {report && report.daily.length > 0 ? <>
            <div className="sales-report-legend"><span className="sales-report-legend__revenue">Sales revenue</span><span className="sales-report-legend__expenditure">Vendor payments</span><span className="sales-report-legend__profit">Gross profit</span></div>
            <div className="sales-report-chart" aria-label={chartData.length > 31 ? "Monthly revenue, vendor payments, and estimated gross profit" : "Daily revenue, vendor payments, and estimated gross profit"}>
            {chartData.map((day) => <div className="sales-report-bar" key={day.date} title={`${day.date}: Revenue ${money(day.total)}, vendor payments ${money(day.expenditure)}, estimated gross profit ${money(day.grossProfit)}`}>
              <div className="sales-report-bar__group">
                <span className="sales-report-bar__revenue" style={{ height: `${Math.max(3, day.total / maxChartValue * 125)}px` }} />
                <span className="sales-report-bar__expenditure" style={{ height: `${Math.max(3, day.expenditure / maxChartValue * 125)}px` }} />
                <span className="sales-report-bar__profit" style={{ height: `${Math.max(3, Math.max(0, day.grossProfit) / maxChartValue * 125)}px` }} />
              </div>
              <small>{isMonthlyChart
                ? new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))
                : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</small>
            </div>)}
            </div>
          </> : report && <p className="empty-state">No sales or vendor payments were recorded in this date range.</p>}
          {report && <div className="sales-report-projection">
            <div className="surface-card__heading"><div><h3>Next 30-day projection</h3><p>Linear estimate based on average daily results in the selected period</p></div></div>
            <div className="sales-projection-chart" aria-label="Projected 30-day sales, vendor payments, profit, and cash flow">
              {projectionMetrics.map((metric) => <div className="sales-projection-chart__row" key={metric.label}>
                <span>{metric.label}</span><div><i className={metric.className} style={{ width: `${Math.max(0, metric.value) / maxProjectionValue * 100}%` }} /></div><strong>{money(metric.value)}</strong>
              </div>)}
            </div>
            <div className="sales-report-summary">
              <div className="sales-report-metric"><span>Projected sales</span><strong>{money(report.projection.sales)}</strong></div>
              <div className="sales-report-metric"><span>Projected vendor payments</span><strong>{money(report.projection.expenditure)}</strong></div>
              <div className="sales-report-metric"><span>Projected gross profit</span><strong>{money(report.projection.grossProfit)}</strong></div>
              <div className="sales-report-metric"><span>Projected net cash flow</span><strong>{money(report.projection.netCashFlow)}</strong></div>
            </div>
            <p className="muted-copy">Gross profit is shown only for sales with captured purchase costs. Older sales without cost records are excluded; projections are linear estimates, not guarantees.</p>
          </div>}
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
