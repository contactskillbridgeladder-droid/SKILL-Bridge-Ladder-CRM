"use client";
import { useState, useEffect } from "react";
import { getAuditLogs, AuditLog } from "@/lib/firestore";
import { TableSkeleton } from "@/components/Skeletons";

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");

  useEffect(() => {
    getAuditLogs().then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  const actions = Array.from(new Set(logs.map(l => l.action)));

  const filtered = logs.filter(l => {
    const q = search.toLowerCase();
    const matchesSearch = !q || 
      [l.performedByName, l.performedByEmail, l.details].some(v => v?.toLowerCase().includes(q));
    const matchesAction = actionFilter === "All" || l.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const getActionBadgeColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "create task":
      case "add channel":
        return "badge-green";
      case "update task":
      case "update team member":
      case "edit channel":
        return "badge-purple";
      case "delete task":
      case "delete channel":
        return "badge-red";
      default:
        return "badge-blue";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Activity Audit Trail</h1>
          <p className="page-subtitle">Track modifications, role updates, task assignments, and configurations live.</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }} className="animate-fade">
        <div className="stat-card">
          <div className="stat-icon-wrap icon-purple">🛡️</div>
          <div className="stat-bottom">
            <div className="stat-value">{logs.length}</div>
            <div className="stat-label">Total Logged Actions</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap icon-green">⚡</div>
          <div className="stat-bottom">
            <div className="stat-value">
              {logs.filter(l => l.action.toLowerCase().includes("create")).length}
            </div>
            <div className="stat-label">Creations</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap icon-blue">✏️</div>
          <div className="stat-bottom">
            <div className="stat-value">
              {logs.filter(l => l.action.toLowerCase().includes("update") || l.action.toLowerCase().includes("edit")).length}
            </div>
            <div className="stat-label">Modifications</div>
          </div>
        </div>
      </div>

      {/* Filters and List */}
      <div className="section-card animate-fade">
        <div className="section-header" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="section-title">Audit Logs</div>
            <div className="section-subtitle">Real-time system events list</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="search-wrap" style={{ width: 240 }}>
              <span className="search-icon">🔍</span>
              <input 
                className="crm-input" 
                placeholder="Search user or details…" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
            <select 
              className="crm-input" 
              style={{ width: "auto" }} 
              value={actionFilter} 
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="All">All Actions</option>
              {actions.map(act => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🛡️</div>
            <div className="empty-title">No matching audit logs</div>
            <div className="empty-desc">Adjust filters or search parameters.</div>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Performed By</th>
                  <th>Email</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id}>
                    <td>
                      <span className={`badge ${getActionBadgeColor(l.action)}`}>
                        {l.action}
                      </span>
                    </td>
                    <td>
                      <span className="cell-strong" style={{ fontSize: 13.5 }}>
                        {l.details}
                      </span>
                    </td>
                    <td>{l.performedByName}</td>
                    <td style={{ fontSize: 12.5 }} className="cell-mono">{l.performedByEmail}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {l.createdAt?.toDate?.()?.toLocaleString("en-IN") || "—"}
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
