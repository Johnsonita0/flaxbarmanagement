import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Check, Copy, Plus, ShieldCheck, X } from "lucide-react";
import { apiRequest, type CurrentUser } from "../lib/api";
import { useToast } from "./ToastProvider";

export interface PaymentAccount {
  id: string;
  method: "transfer" | "opay";
  label: string;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
}

interface DepartmentStaff {
  id: string;
  name: string;
}

interface TransferCode {
  id: string;
  staffName: string;
  generatedByName?: string;
  departmentName?: string;
  businessDate: string;
  status?: string;
  createdAt: string;
}

interface PendingTransfer {
  id: string;
  staffName: string;
  method: "transfer" | "opay";
  total: number;
  reference: string | null;
  account: {
    label: string;
    bankName: string | null;
    accountName: string;
    accountNumber: string;
  } | null;
  items: { name: string; quantity: number }[];
  createdAt: string;
}

const money = (amount: number) => `₦${amount.toLocaleString()}`;

export default function SalesPaymentManagement({
  user,
  accounts,
  onAccountsChanged,
  onTransfersChanged,
}: {
  user: CurrentUser;
  accounts: PaymentAccount[];
  onAccountsChanged: () => void;
  onTransfersChanged: () => void;
}) {
  const { showToast } = useToast();
  const [staff, setStaff] = useState<DepartmentStaff[]>([]);
  const [codes, setCodes] = useState<TransferCode[]>([]);
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [method, setMethod] = useState<"transfer" | "opay">("transfer");
  const [label, setLabel] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    const requests: Promise<void>[] = [];
    if (user.role === "super_admin") {
      requests.push(apiRequest<{ codes: TransferCode[] }>("/api/v1/sales/payments/transfer-codes/pending")
        .then((result) => { if (active) setCodes(result.codes); }));
    } else if (user.role === "department_supervisor") {
      requests.push(Promise.all([
        apiRequest<{ staff: DepartmentStaff[]; codes: TransferCode[] }>("/api/v1/sales/payments/transfer-codes/manage"),
        apiRequest<{ transfers: PendingTransfer[] }>("/api/v1/sales/payments/transfers/pending"),
      ]).then(([codeData, transferData]) => {
        if (!active) return;
        setStaff(codeData.staff);
        setCodes(codeData.codes);
        setTransfers(transferData.transfers);
        setSelectedStaff((current) => current || codeData.staff[0]?.id || "");
      }));
    }
    if (requests.length) {
      void Promise.all(requests).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "We couldn't load payment approvals.");
      });
    }
    return () => { active = false; };
  }, [refresh, user.departmentId, user.role]);

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ message: string }>("/api/v1/sales/payments/accounts", {
        method: "POST",
        body: JSON.stringify({ method, label, bankName: method === "transfer" ? bankName : null, accountName, accountNumber }),
      });
      setMessage(result.message);
      setLabel("");
      setBankName("");
      setAccountName("");
      setAccountNumber("");
      onAccountsChanged();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't add that company payment account.");
    } finally {
      setBusy(false);
    }
  }

  async function setAccountActive(account: PaymentAccount, isActive: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/sales/payments/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      setMessage(result.message);
      onAccountsChanged();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't update that company account.");
    } finally {
      setBusy(false);
    }
  }

  async function generateCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStaff) return;
    setBusy(true);
    setError("");
    setMessage("");
    setGeneratedCode("");
    try {
      const result = await apiRequest<{ code: string; message: string }>("/api/v1/sales/payments/transfer-codes", {
        method: "POST",
        body: JSON.stringify({ staffId: selectedStaff }),
      });
      setGeneratedCode(result.code);
      setMessage(result.message);
      setRefresh((value) => value + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't generate the daily transfer code.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(generatedCode);
      showToast("Daily transfer code copied.", "success");
    } catch {
      setError("Copy was unavailable. Select and copy the code manually.");
    }
  }

  async function reviewCode(code: TransferCode, decision: "approved" | "rejected") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/sales/payments/transfer-codes/${code.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      setMessage(result.message);
      setRefresh((value) => value + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't review that transfer code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTransfer(transfer: PendingTransfer, decision: "approved" | "rejected") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ message: string }>(`/api/v1/sales/payments/transfers/${transfer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      setMessage(result.message);
      onTransfersChanged();
      setRefresh((value) => value + 1);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "We couldn't verify that transfer.");
    } finally {
      setBusy(false);
    }
  }

  if (user.role !== "super_admin" && user.role !== "department_supervisor") return null;

  return (
    <details className="sales-payment-management">
      <summary><ShieldCheck size={16} /> {user.role === "super_admin" ? "Payment accounts & approvals" : "Department transfer controls"}</summary>
      {error && <p className="sales-payment-management__message sales-payment-management__message--error" role="alert">{error}</p>}
      {message && <p className="sales-payment-management__message" role="status">{message}</p>}

      {user.role === "super_admin" && <>
        <section className="sales-payment-management__section">
          <h3>Company receiving accounts</h3>
          <p>Active bank transfer and OPay accounts are shown to staff during checkout.</p>
          {accounts.length > 0 && <div className="sales-payment-management__accounts">
            {accounts.map((account) => <div className="sales-payment-management__row" key={account.id}>
              <span><strong>{account.label} · {account.method === "opay" ? "OPay" : account.bankName}</strong><small>{account.accountName} · {account.accountNumber}</small></span>
              <button className="button button--outline" type="button" disabled={busy} onClick={() => void setAccountActive(account, false)}>Deactivate</button>
            </div>)}
          </div>}
          {accounts.length === 0 && <p className="sales-payment-management__empty">No active company receiving accounts yet.</p>}
          <form className="sales-payment-management__form" onSubmit={(event) => void addAccount(event)}>
            <label>Account type<select value={method} onChange={(event) => setMethod(event.target.value as "transfer" | "opay")}><option value="transfer">Bank transfer</option><option value="opay">OPay</option></select></label>
            <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Main bank account" required maxLength={80} /></label>
            {method === "transfer" && <label>Bank name<input value={bankName} onChange={(event) => setBankName(event.target.value)} required maxLength={80} /></label>}
            <label>Account name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} required maxLength={120} /></label>
            <label>Account number<input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} required maxLength={40} inputMode="numeric" /></label>
            <button className="button button--primary" type="submit" disabled={busy}><Plus size={14} /> Add account</button>
          </form>
        </section>

        <section className="sales-payment-management__section">
          <h3>Daily staff code approvals</h3>
          {codes.length === 0 ? <p className="sales-payment-management__empty">No transfer codes are awaiting approval.</p> : codes.map((code) => <div className="sales-payment-management__row" key={code.id}>
            <span><strong>{code.staffName} · {code.departmentName}</strong><small>Requested by {code.generatedByName} · {code.businessDate}</small></span>
            <span className="sales-payment-management__actions">
              <button className="button button--primary" type="button" disabled={busy} onClick={() => void reviewCode(code, "approved")}><Check size={14} /> Approve</button>
              <button className="button button--outline" type="button" disabled={busy} onClick={() => void reviewCode(code, "rejected")}><X size={14} /> Reject</button>
            </span>
          </div>)}
        </section>
      </>}

      {user.role === "department_supervisor" && <>
        <section className="sales-payment-management__section">
          <h3>Generate today's staff code</h3>
          <p>Codes are valid for your staff member for this business day after Super Admin approval. Share the generated code with them; it is displayed only once.</p>
          <form className="sales-payment-management__form" onSubmit={(event) => void generateCode(event)}>
            <label>Staff member<select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} required>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select></label>
            <button className="button button--primary" type="submit" disabled={busy || !selectedStaff}><Plus size={14} /> Generate code</button>
          </form>
          {generatedCode && <div className="sales-payment-management__code"><strong>{generatedCode}</strong><button className="button button--outline" type="button" onClick={() => void copyCode()}><Copy size={14} /> Copy</button></div>}
          {codes.length > 0 && <div className="sales-payment-management__accounts">
            {codes.map((code) => <div className="sales-payment-management__row" key={code.id}>
              <span><strong>{code.staffName}</strong><small>{code.businessDate}</small></span>
              <span className={`status-pill${code.status === "approved" ? "" : " status-pill--warning"}`}>{code.status?.replace("_", " ")}</span>
            </div>)}
          </div>}
        </section>

        <section className="sales-payment-management__section">
          <h3>Transfers awaiting verification</h3>
          <p>Match each reference with the company bank account before approving it. Rejecting a transfer returns the reserved stock to the seller.</p>
          {transfers.length === 0 ? <p className="sales-payment-management__empty">No transfers are awaiting verification.</p> : transfers.map((transfer) => <div className="sales-payment-management__transfer" key={transfer.id}>
            <div className="sales-payment-management__row">
              <span><strong>{transfer.staffName} · {transfer.method === "opay" ? "OPay" : "Bank transfer"}</strong><small>{transfer.reference} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(transfer.createdAt))}</small></span>
              <strong>{money(transfer.total)}</strong>
            </div>
            {transfer.account && <p>{transfer.account.label}: {transfer.account.accountName} · {transfer.account.accountNumber}</p>}
            <small>{transfer.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</small>
            <span className="sales-payment-management__actions">
              <button className="button button--primary" type="button" disabled={busy} onClick={() => void verifyTransfer(transfer, "approved")}><Check size={14} /> Verify transfer</button>
              <button className="button button--outline" type="button" disabled={busy} onClick={() => void verifyTransfer(transfer, "rejected")}><X size={14} /> Reject</button>
            </span>
          </div>)}
        </section>
      </>}
    </details>
  );
}
