"use client";

import { useState, useEffect } from "react";
import { initFirebase } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { scanMessage } from "@/lib/ai-scanner";

interface Project {
  id: string;
  clientId: string;
  editorId?: string;
  title: string;
  description: string;
  files: string[];
  status: "pending" | "in_progress" | "completed";
  reviewNotes?: string;
  reviewFiles?: string[];
  createdAt: number;
}

export default function EditorProjects({ user }: { user: any }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<any>(null);

  // Review Form State
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let unsubscribe: any;
    const load = async () => {
      const { db } = await initFirebase();
      setDb(db);
      
      // Editors see projects assigned to them
      const q = query(collection(db, "projects"), where("editorId", "==", user.uid));
      unsubscribe = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
        list.sort((a, b) => b.createdAt - a.createdAt);
        setProjects(list);
        setLoading(false);
      });
    };
    load();
    return () => unsubscribe && unsubscribe();
  }, [user.uid]);

  const uploadFile = async (file: File) => {
    const { auth } = await initFirebase();
    const token = await auth.currentUser?.getIdToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("pathPrefix", `deliveries/${user.uid}`);

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  };

  const handleReviewSubmit = async (e: React.FormEvent, projectId: string) => {
    e.preventDefault();
    if (!db) return;

    setSubmitting(true);

    const scanResult = scanMessage(reviewNotes);
    if (scanResult.wasModerated) {
      setSubmitting(false);
      alert("Delivery Rejected:\nYour notes contain prohibited contact information, external links, or payment details. Please remove them to proceed.");
      return;
    }

    try {
      const uploadedFiles = [];
      for (const f of reviewFiles) {
        const url = await uploadFile(f);
        uploadedFiles.push(url);
      }
      
      await updateDoc(doc(db, "projects", projectId), {
        status: "completed",
        reviewNotes,
        reviewFiles: uploadedFiles
      });
      
      setActiveReviewId(null);
      setReviewNotes("");
      setReviewFiles([]);
    } catch (err: any) {
      alert("Failed to submit delivery: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const markInProgress = async (projectId: string) => {
    if (!db) return;
    await updateDoc(doc(db, "projects", projectId), { status: "in_progress" });
  };

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading assigned projects...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto", width: "100%" }}>
      <h2 style={{ marginBottom: 20, color: "var(--text)" }}>Assigned Projects</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        {projects.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40, background: "var(--bg-card)", borderRadius: 8 }}>
            No projects assigned to you yet.
          </div>
        )}
        
        {projects.map(p => (
          <div key={p.id} style={{ background: "var(--bg-card)", padding: 20, borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: "0 0 10px 0", color: "var(--text)" }}>{p.title}</h3>
              <span style={{ 
                padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: "bold",
                background: p.status === 'completed' ? '#059669' : (p.status === 'in_progress' ? '#d97706' : '#ef4444'),
                color: '#fff'
              }}>
                {p.status.toUpperCase()}
              </span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 14, whiteSpace: "pre-wrap" }}>{p.description}</p>
            
            {p.files.length > 0 && (
              <div style={{ marginTop: 15 }}>
                <strong style={{ fontSize: 12, color: "var(--text-muted)" }}>CLIENT FILES:</strong>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5 }}>
                  {p.files.map((f, i) => (
                    <a key={i} href={f} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--primary)", background: "rgba(99,102,241,0.1)", padding: "4px 8px", borderRadius: 4, textDecoration: "none" }}>
                      Download Attachment {i+1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {p.status === "pending" && (
              <button 
                className="crm-button" 
                style={{ marginTop: 15 }}
                onClick={() => markInProgress(p.id)}
              >
                Mark as In Progress
              </button>
            )}

            {p.status === "in_progress" && activeReviewId !== p.id && (
              <button 
                className="crm-button" 
                style={{ marginTop: 15, background: "#10b981" }}
                onClick={() => setActiveReviewId(p.id)}
              >
                Submit Delivery / Review
              </button>
            )}

            {activeReviewId === p.id && (
              <form onSubmit={(e) => handleReviewSubmit(e, p.id)} style={{ marginTop: 20, padding: 15, background: "rgba(16,185,129,0.05)", borderRadius: 8, border: "1px solid #10b981" }}>
                <h4 style={{ margin: "0 0 15px 0", color: "#10b981" }}>Submit Delivery</h4>
                <div className="form-group">
                  <label className="form-label">Review Notes</label>
                  <textarea required className="crm-input" style={{ minHeight: 80 }} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Files</label>
                  <input type="file" multiple className="crm-input" onChange={e => setReviewFiles(Array.from(e.target.files || []))} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button disabled={submitting} type="submit" className="crm-button" style={{ background: "#10b981", flex: 1 }}>
                    {submitting ? "Uploading..." : "Complete Project"}
                  </button>
                  <button type="button" className="crm-button" style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }} onClick={() => setActiveReviewId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {p.status === "completed" && (
              <div style={{ marginTop: 20, padding: 15, background: "rgba(16,185,129,0.1)", borderRadius: 8, borderLeft: "4px solid #10b981" }}>
                <strong style={{ display: "block", marginBottom: 5, color: "#10b981" }}>Your Delivery:</strong>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text)", whiteSpace: "pre-wrap" }}>{p.reviewNotes}</p>
                {p.reviewFiles && p.reviewFiles.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                    {p.reviewFiles.map((f, i) => (
                      <a key={i} href={f} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#fff", background: "#10b981", padding: "4px 8px", borderRadius: 4, textDecoration: "none" }}>
                        Delivered File {i+1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
