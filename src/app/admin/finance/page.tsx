"use client";
import { useState, useEffect } from "react";
import { getPayments, markPaymentPaid, markZohoLogged, Payment } from "@/lib/firestore";

export default function AdminFinance() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const load = () => getPayments().then(p => { setPayments(p); setLoading(false); });
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleMarkPaid = async (id: string, p: Payment) => {
    await markPaymentPaid(id);
    // Send payment notification email + in-app
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toUid: p.toUid, toEmail: p.toEmail, toName: p.toName,
        type: "payment_released",
        title: "💰 Payment Released!",
        subject: `SkillBridge CRM: ₹${p.amount.toLocaleString("en-IN")} payment released`,
        message: `Great news! Your payment of ₹${p.amount.toLocaleString("en-IN")} for "${p.taskTitle}" has been released. Keep up the excellent work!`,
        ctaText: "View My Earnings",
        ctaLink: "https://crm.skillbridgeladder.in/editor/earnings",
      }),
    });
    showToast("✅ Marked paid & editor notified via email");
    load();
  };

  const handleZoho = async (id: string) => {
    await markZohoLogged(id);
    showToast("✅ Marked as logged in Zoho Books");
    load();
  };

  const totalPaid = payments.filter(p => p.status === "Paid").reduce((a, p) => a + p.amount, 0);
  const pending = payments.filter(p => p.status === "Pending").reduce((a, p) => a + p.amount, 0);
  const zohoNeeded = payments.filter(p => p.status === "Paid" && !p.zohoLogged).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      <div className="page-header animate-fade">
        <div><h1 className="page-title">Finance</h1><p className="page-subtitle">Live payment tracking — approving a payment notifies the editor by email.</p></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }} className="animate-fade">
        {[
          { label: "Total Paid Out", value: `₹${totalPaid.toLocaleString("en-IN")}`, icon: "✅", color: "icon-green" },
          { label: "Pending Payout", value: `₹${pending.toLocaleString("en-IN")}`, icon: "⏳", color: "icon-amber" },
          { label: "Zoho Needed", value: String(zohoNeeded), icon: "📒", color: "icon-blue" },
          { label: "Total Records", value: String(payments.length), icon: "📋", color: "icon-purple" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom"><div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="section-card animate-fade">
        <div className="section-header"><div className="section-title">Payment Ledger</div><div className="section-subtitle">Releasing a payment sends email + in-app notification</div></div>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading from Firebase…</div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Task</th><th>Recipient</th><th>Role</th><th>Amount</th><th>Status</th><th>Zoho</th><th>Actions</th></tr></thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">💰</div><div className="empty-title">No payments yet</div><div className="empty-desc">Payments are created automatically when tasks are approved.</div></div></td></tr>
                ) : payments.map(p => (
                  <tr key={p.id}>
                    <td><span className="cell-strong" style={{ fontSize: 13 }}>{p.taskTitle}</span></td>
                    <td>{p.toName}</td>
                    <td><span className={`badge ${p.role === "head_editor" ? "badge-purple" : "badge-blue"}`}>{p.role === "head_editor" ? "Head Editor" : "Editor"}</span></td>
                    <td><span style={{ fontWeight: 700, color: "var(--green)" }}>₹{p.amount.toLocaleString("en-IN")}</span></td>
                    <td><span className={`badge ${p.status === "Paid" ? "badge-green" : "badge-amber"}`}>{p.status}</span></td>
                    <td>{p.status === "Paid" ? <span className={`badge ${p.zohoLogged ? "badge-green" : "badge-red"}`}>{p.zohoLogged ? "Logged" : "Pending"}</span> : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.status === "Pending" && <button className="btn btn-primary btn-sm" onClick={() => handleMarkPaid(p.id!, p)}>Release Payment</button>}
                        {p.status === "Paid" && !p.zohoLogged && <button className="btn btn-ghost btn-sm" onClick={() => handleZoho(p.id!)}>Log Zoho</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
