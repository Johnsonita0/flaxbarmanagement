import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from "lucide-react";
import PageHeading from "../components/PageHeading";
import PreviewNotice from "../components/PreviewNotice";
import "./../css/OperationsPages.css";

export default function CashManagementPage() {
  const [transaction, setTransaction] = useState<"received" | "paid" | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <section className="module-page">
      <PageHeading title="Cash Management" description="Cash session totals and expected-versus-actual reconciliation." action={{ label: "View Report", onClick: () => setNotice("Cash reporting is a preview until the backend module is connected.") }} />
      <PreviewNotice />
      <div className="metric-grid">
        <div className="metric-card"><small>Opening balance</small><strong>₦250,000</strong></div>
        <div className="metric-card metric-card--green"><small>Cash received</small><strong>₦120,000</strong></div>
        <div className="metric-card metric-card--red"><small>Cash paid out</small><strong>₦20,000</strong></div>
        <div className="metric-card"><small>Closing balance</small><strong>₦480,000</strong></div>
      </div>
      <div className="surface-card reconciliation">
        <div className="surface-card__heading"><div><h2>Expected vs actual</h2><p>Sample cash session · not live figures</p></div><ReceiptText size={18} color="#8292a4" /></div>
        <div className="reconciliation__values"><div><small>Expected</small><strong>₦480,000</strong></div><span>−</span><div><small>Actual</small><strong>₦472,500</strong></div><div className="variance"><small>Variance</small><strong>−₦7,500</strong></div></div>
      </div>
      {notice && <div className="alert alert--success" role="status">{notice}</div>}
      {transaction ? (
        <div className="surface-card form-card"><div className="surface-card__heading"><h2>Record cash {transaction}</h2><button onClick={() => setTransaction(null)}>Cancel</button></div><label>Amount (₦)<input type="number" min="0" placeholder="0" /></label><label>Description<input placeholder="Reason or reference" /></label><button className="button button--primary" onClick={() => { setNotice("Transaction preview only. No cash record was saved."); setTransaction(null); }}>Preview transaction</button></div>
      ) : (
        <div className="cash-actions"><button className="button button--outline" onClick={() => setTransaction("received")}><ArrowDownLeft size={16} /> Cash Received</button><button className="button button--outline" onClick={() => setTransaction("paid")}><ArrowUpRight size={16} /> Cash Paid Out</button></div>
      )}
      <div className="surface-card"><div className="surface-card__heading"><div><h2>Recent cash entries</h2><p>Illustrative activity only</p></div></div><div className="record-row"><span className="cash-entry-icon cash-entry-icon--in"><ArrowDownLeft size={16} /></span><span className="record-row__main"><strong>Cash received</strong><small>Today · sample entry</small></span><strong className="entry-positive">+₦45,000</strong></div><div className="record-row"><span className="cash-entry-icon cash-entry-icon--out"><ArrowUpRight size={16} /></span><span className="record-row__main"><strong>Supplies expense</strong><small>Today · sample entry</small></span><strong className="entry-negative">−₦12,500</strong></div></div>
    </section>
  );
}
