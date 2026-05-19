"use client";
import { useState, useEffect } from "react";
import { getPaymentsByUser, Payment } from "@/lib/firestore";
import { initFirebase } from "@/lib/firebase";

export default function EditorEarnings() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initFirebase().then(({ auth }) => {
      if (!auth.currentUser) return;
      getPaymentsByUser(auth.currentUser.uid).then(p => { setPayments(p); setLoading(false); });
    });
  }, []);

  const total = payments.reduce((a, p) => a + p.amount, 0);
  const paid = payments.filter(p => p.status === "Paid").reduce((a, p) => a + p.amount, 0);
  const pending = payments.filter(p => p.status === "Pending").reduce((a, p) => a + p.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header animate-fade">
        <div><h1 className="page-title">My Earnings</h1><p className="page-subtitle">Your payment history from Firebase — updated by admin.</p></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 16 }} className="animate-fade">
        {[
          { label: "Total Earned", value: `₹${total.toLocaleString("en-IN")}`, icon: "💰", color: "icon-green" },
          { label: "Paid Out", value: `₹${paid.toLocaleString("en-IN")}`, icon: "✅", color: "icon-purple" },
          { label: "Awaiting", value: `₹${pending.toLocaleString("en-IN")}`, icon: "⏳", color: "icon-amber" },
          { label: "Tasks Paid", value: String(payments.filter(p => p.status === "Paid").length), icon: "📋", color: "icon-blue" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom"><div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="section-card animate-fade">
        <div className="section-header"><div className="section-title">Payment History</div><div className="section-subtitle">You'll get an email & in-app notification when a payment is released</div></div>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading…</div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Task</th><th>Amount</th><th>Status</th><th>Paid On</th></tr></thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty-state"><div className="empty-icon">💰</div><div className="empty-title">No payments yet</div><div className="empty-desc">Payments appear here when the admin releases them after approving your work.</div></div></td></tr>
                ) : payments.map(p => (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.taskTitle}</td>
                    <td><span style={{ fontWeight: 700, color: p.status === "Paid" ? "var(--green)" : "var(--amber)" }}>₹{p.amount.toLocaleString("en-IN")}</span></td>
                    <td><span className={`badge ${p.status === "Paid" ? "badge-green" : "badge-amber"}`}>{p.status}</span></td>
                    <td style={{ color: "var(--text-muted)", fontSize: 13 }}>{p.paidAt?.toDate?.()?.toLocaleDateString("en-IN") || "—"}</td>
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
