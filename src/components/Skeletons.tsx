import React from "react";

export function StatSkeleton() {
  return (
    <div className="stat-card skeleton" style={{ minHeight: 140 }}>
      <div style={{ display: "flex", gap: 12, flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.05)" }} className="skeleton"></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: "60%", height: 28, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} className="skeleton"></div>
          <div style={{ width: "40%", height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} className="skeleton"></div>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="crm-table-wrap">
      <table className="crm-table" style={{ opacity: 0.7 }}>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div style={{ width: 60 + ((i * 17) % 40), height: 12, background: "rgba(255,255,255,0.1)", borderRadius: 4 }} className="skeleton"></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div style={{ width: 80 + (((r + c) * 23) % 60), height: 16, background: "rgba(255,255,255,0.04)", borderRadius: 4 }} className="skeleton"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TaskBoardSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ width: 80, height: 18, background: "rgba(255,255,255,0.08)", borderRadius: 4 }} className="skeleton"></div>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} className="skeleton"></div>
          </div>
          {Array.from({ length: 2 }).map((_, card) => (
            <div key={card} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ width: "90%", height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} className="skeleton"></div>
              <div style={{ width: "50%", height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} className="skeleton"></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ width: 60, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 8 }} className="skeleton"></div>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} className="skeleton"></div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
