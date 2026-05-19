"use client";
import { useState, useEffect } from "react";
import { getChannels, getUsers, logAIAnalysis, getAIAnalysisLogs, AIAnalysisLog, Channel, UserProfile } from "@/lib/firestore";
import { initFirebase } from "@/lib/firebase";

interface Suggestion {
  timestamp: string;
  title: string;
  summary: string;
}

export default function VideoAIPage() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    authorName: string;
    suggestions: Suggestion[];
  } | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AIAnalysisLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [matchedChannelId, setMatchedChannelId] = useState("");
  const [toast, setToast] = useState("");

  // Scan status ticker state
  const [scanStep, setScanStep] = useState(0);

  // Segment task forms states (keyed by index)
  const [assignments, setAssignments] = useState<Record<number, {
    editorUid: string;
    headEditorUid: string;
    adminPrice: string;
    editorPay: string;
    headPay: string;
    due: string;
    notes: string;
    saving: boolean;
    created: boolean;
  }>>({});

  useEffect(() => {
    getChannels().then(setChannels);
    getUsers().then(setUsers);
    getAIAnalysisLogs().then(l => {
      setLogs(l);
      setLoadingLogs(false);
    });
  }, []);

  // Interval for scanning text status updates
  useEffect(() => {
    let interval: any;
    if (analyzing) {
      setScanStep(0);
      interval = setInterval(() => {
        setScanStep(s => (s < 3 ? s + 1 : 3));
      }, 2500);
    } else {
      setScanStep(0);
    }
    return () => clearInterval(interval);
  }, [analyzing]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setResult(data);

      // Auto-match channel by handle or name
      const authorClean = data.authorName.toLowerCase().replace(/\s+/g, "");
      const matched = channels.find(c => {
        const handleClean = c.handle.toLowerCase().replace(/[@\s]/g, "");
        const nameClean = c.name.toLowerCase().replace(/\s+/g, "");
        return handleClean.includes(authorClean) || authorClean.includes(handleClean) ||
               nameClean.includes(authorClean) || authorClean.includes(nameClean);
      });

      if (matched && matched.id) {
        setMatchedChannelId(matched.id);
        showToast(`🎯 Auto-matched channel: ${matched.handle}`);
      } else {
        setMatchedChannelId("");
      }

      // Initialize forms for suggestions
      const initialAssignments: typeof assignments = {};
      if (Array.isArray(data.suggestions)) {
        data.suggestions.forEach((s: Suggestion, idx: number) => {
          initialAssignments[idx] = {
            editorUid: "",
            headEditorUid: "",
            adminPrice: "1000",
            editorPay: "800",
            headPay: "100",
            due: "2 days",
            notes: `Shorts cut from main video segment (${s.timestamp})`,
            saving: false,
            created: false
          };
        });
      }
      setAssignments(initialAssignments);

      // Save AI analysis log
      initFirebase().then(async ({ auth }) => {
        const u = auth.currentUser;
        if (u) {
          await logAIAnalysis(url, data.title, data.suggestions.length, {
            uid: u.uid,
            email: u.email || "hr@skillbridgeladder.in"
          });
          const freshLogs = await getAIAnalysisLogs();
          setLogs(freshLogs);
        }
      });

    } catch (err: any) {
      showToast("❌ Analysis failed: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateTask = async (idx: number, suggestion: Suggestion) => {
    const form = assignments[idx];
    const channelId = matchedChannelId;

    if (!channelId) {
      showToast("⚠️ Please select a channel first.");
      return;
    }

    setAssignments(prev => ({
      ...prev,
      [idx]: { ...prev[idx], saving: true }
    }));

    try {
      const res = await fetch("/api/video-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          videoTitle: `[Shorts] ${suggestion.title}`,
          youtubeUrl: url,
          type: "Shorts",
          notes: `${suggestion.summary}\n${form.notes}`,
          due: form.due,
          adminPrice: parseFloat(form.adminPrice) || 0,
          editorPay: parseFloat(form.editorPay) || 0,
          headPay: parseFloat(form.headPay) || 0,
          editorUid: form.editorUid || null,
          headEditorUid: form.headEditorUid || null
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setAssignments(prev => ({
        ...prev,
        [idx]: { ...prev[idx], saving: false, created: true }
      }));
      showToast("✅ Task created & team notified!");
    } catch (err: any) {
      showToast("❌ Failed to create task: " + err.message);
      setAssignments(prev => ({
        ...prev,
        [idx]: { ...prev[idx], saving: false }
      }));
    }
  };

  const editors = users.filter(u => u.role === "editor");
  const headEditors = users.filter(u => u.role === "head_editor");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: "24px 0" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">AI Video Analyzer</h1>
          <p className="page-subtitle">Paste a YouTube video link to extract key points with Gemini and instantly assign editing tasks.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/tasks" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            ← Back to Tasks
          </a>
        </div>
      </div>

      {/* Input section */}
      <div className="section-card animate-fade" style={{ padding: 24 }}>
        <form onSubmit={handleAnalyze} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            className="crm-input"
            required
            placeholder="Paste YouTube Video URL (e.g., https://www.youtube.com/watch?v=...)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={{ flex: 1, minWidth: 280 }}
            disabled={analyzing}
          />
          <button type="submit" className="btn btn-primary" disabled={analyzing} style={{ minWidth: 150 }}>
            {analyzing ? "Analyzing…" : "⚡ Analyze Video"}
          </button>
        </form>
      </div>

      {/* Analyzing Scanning Loader animation */}
      {analyzing && (
        <div className="section-card animate-fade" style={{ padding: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, border: "1px solid rgba(124, 58, 237, 0.4)", background: "rgba(124, 58, 237, 0.03)" }}>
          <div className="ai-scanning-wrapper">
            <div className="ai-scanning-grid"></div>
            <div className="ai-scanning-ray"></div>
            <div className="ai-scanning-logo">🧠</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Gemini Video Scanner Active</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>Processing video frames and scanning transcripts...</p>
          </div>
          <div className="ai-status-ticks">
            <div className={`tick ${scanStep >= 0 ? "active" : ""}`}>Contacting video streams...</div>
            <div className={`tick ${scanStep >= 1 ? "active" : ""}`}>Extracting frame sequences and transcript metadata...</div>
            <div className={`tick ${scanStep >= 2 ? "active" : ""}`}>Scanning content clusters with Gemini...</div>
            <div className={`tick ${scanStep >= 3 ? "active" : ""}`}>Generating timestamped highlights...</div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* oEmbed Metacard */}
          <div className="section-card" style={{ padding: 20, display: "flex", gap: 16, alignItems: "center", background: "rgba(124,58,237,0.05)" }}>
            <div style={{ fontSize: 32 }}>🎬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Source Video</div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{result.title}</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Channel: {result.authorName}</p>
            </div>
            <div style={{ minWidth: 200 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Client Channel</label>
              <select
                className="crm-input"
                value={matchedChannelId}
                onChange={e => setMatchedChannelId(e.target.value)}
                required
              >
                <option value="">Select Channel…</option>
                {channels.map(c => <option key={c.id} value={c.id}>{c.handle} ({c.name})</option>)}
              </select>
            </div>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Gemini Suggested Shorts ({result.suggestions.length})</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
            {Array.isArray(result.suggestions) && result.suggestions.map((s, idx) => {
              const form = assignments[idx];
              if (!form) return null;

              return (
                <div key={idx} className="section-card" style={{ padding: 24, border: form.created ? "1px solid var(--green)" : "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 16 }}>
                    <div>
                      <span className="badge badge-purple" style={{ fontSize: 11, padding: "3px 8px" }}>
                        ⏱️ {s.timestamp}
                      </span>
                      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{s.title}</h3>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{s.summary}</p>
                    </div>
                    {form.created && (
                      <span className="badge badge-green" style={{ alignSelf: "flex-start", padding: "4px 10px" }}>
                        ✓ Task Created
                      </span>
                    )}
                  </div>

                  {!form.created && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Assign Editor</label>
                          <select
                            className="crm-input"
                            value={form.editorUid}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], editorUid: e.target.value }
                            }))}
                          >
                            <option value="">Unassigned</option>
                            {editors.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Head Editor</label>
                          <select
                            className="crm-input"
                            value={form.headEditorUid}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], headEditorUid: e.target.value }
                            }))}
                          >
                            <option value="">None</option>
                            {headEditors.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Due Date</label>
                          <input
                            className="crm-input"
                            value={form.due}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], due: e.target.value }
                            }))}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 14 }}>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Total Price (₹)</label>
                          <input
                            className="crm-input"
                            type="number"
                            value={form.adminPrice}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], adminPrice: e.target.value }
                            }))}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Editor Share (₹)</label>
                          <input
                            className="crm-input"
                            type="number"
                            value={form.editorPay}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], editorPay: e.target.value }
                            }))}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: 11 }}>Head Share (₹)</label>
                          <input
                            className="crm-input"
                            type="number"
                            value={form.headPay}
                            onChange={e => setAssignments(prev => ({
                              ...prev,
                              [idx]: { ...prev[idx], headPay: e.target.value }
                            }))}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 11 }}>Segment Notes</label>
                        <input
                          className="crm-input"
                          value={form.notes}
                          onChange={e => setAssignments(prev => ({
                            ...prev,
                            [idx]: { ...prev[idx], notes: e.target.value }
                          }))}
                        />
                      </div>

                      <button
                        onClick={() => handleCreateTask(idx, s)}
                        disabled={form.saving}
                        className="btn btn-primary"
                        style={{ alignSelf: "flex-end", minWidth: 160 }}
                      >
                        {form.saving ? "Creating Task…" : "🚀 Create Task & Notify"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Analysis logs history */}
      <div className="section-card animate-fade">
        <div className="section-header">
          <div>
            <div className="section-title">AI Analysis History</div>
            <div className="section-subtitle">Track all past video analysis runs and generated highlight suggestions</div>
          </div>
        </div>

        {loadingLogs ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading analysis history…</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧠</div>
            <div className="empty-title">No analysis logs yet</div>
            <div className="empty-desc">Paste a link above to start utilizing Gemini.</div>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Video Title</th>
                  <th>Video URL</th>
                  <th>Suggestions</th>
                  <th>Performed By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td><span className="cell-strong">{log.title}</span></td>
                    <td>
                      <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "none", fontSize: 12.5 }} className="cell-mono">
                        {log.url.length > 35 ? log.url.slice(0, 35) + "..." : log.url}
                      </a>
                    </td>
                    <td><span className="badge badge-purple">{log.suggestionsCount} suggestions</span></td>
                    <td style={{ fontSize: 13 }}>{log.performedByEmail}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {log.createdAt?.toDate?.()?.toLocaleString("en-IN") || "—"}
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
