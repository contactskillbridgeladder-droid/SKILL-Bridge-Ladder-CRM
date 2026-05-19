export default function EditorDashboard() {
  const myTasks = [
    { id: "T-001", title: "Tech Channel S2E04 – Main Edit", type: "Main Edit", status: "In Review", myEarning: "₹2,000", due: "Today" },
    { id: "T-005", title: "Finance S1E12 – Main Edit", type: "Main Edit", status: "In Progress", myEarning: "₹2,200", due: "2 days" },
  ];

  return (
    <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>My Dashboard</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Your assigned tasks and earnings overview.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {[
          { label: "Active Tasks", value: "2", icon: "📋" },
          { label: "Completed", value: "14", icon: "✅" },
          { label: "My Earnings", value: "₹4,200", icon: "💰" },
          { label: "Feedback", value: "1", icon: "💬" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>My Assigned Tasks</h2>
        </div>
        <table className="crm-table">
          <thead>
            <tr>
              <th>ID</th><th>Task</th><th>Type</th><th>Status</th><th>My Earning</th><th>Due</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {myTasks.map(t => (
              <tr key={t.id}>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{t.id}</td>
                <td style={{ color: "var(--text)", fontWeight: 500 }}>{t.title}</td>
                <td><span className={`badge ${t.type === "Shorts" ? "badge-blue" : "badge-purple"}`}>{t.type}</span></td>
                <td><span className="badge badge-yellow">{t.status}</span></td>
                <td style={{ fontWeight: 600, color: "var(--green)" }}>{t.myEarning}</td>
                <td style={{ color: t.due === "Today" ? "var(--yellow)" : "var(--text-dim)" }}>{t.due}</td>
                <td><button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>Submit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
