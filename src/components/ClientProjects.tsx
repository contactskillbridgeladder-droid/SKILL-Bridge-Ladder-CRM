"use client";

import { useState, useEffect } from "react";
import { initFirebase } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
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

export default function ClientProjects({ user }: { user: any }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<any>(null);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let unsubscribe: any;
    const load = async () => {
      const { db } = await initFirebase();
      setDb(db);
      const q = query(collection(db, "projects"), where("clientId", "==", user.uid));
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
    formData.append("pathPrefix", `projects/${user.uid}`);

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setTitle(p.title);
    setDescription(p.description);
    setFiles([]); // Note: existing files aren't removed here, we just allow appending new ones for simplicity
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setFiles([]);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await deleteDoc(doc(db, "projects", id));
    } catch (err: any) {
      alert("Failed to delete project: " + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !db) return;
    
    setSubmitting(true);
    
    // AI Safety Scanner
    const scanResult = scanMessage(title + "\n\n" + description);
    if (scanResult.wasModerated) {
      setSubmitting(false);
      alert("Task Assignment Rejected:\nYour project details contain prohibited contact information, external links, or payment details. Please remove them to proceed.");
      return;
    }

    try {
      const uploadedFiles = [];
      for (const f of files) {
        const url = await uploadFile(f);
        uploadedFiles.push(url);
      }
      
      if (editingId) {
        // Find existing to preserve old files
        const existingProject = projects.find(p => p.id === editingId);
        const combinedFiles = existingProject ? [...existingProject.files, ...uploadedFiles] : uploadedFiles;
        
        await updateDoc(doc(db, "projects", editingId), {
          title,
          description,
          files: combinedFiles
        });
      } else {
        await addDoc(collection(db, "projects"), {
          clientId: user.uid,
          editorId: user.assignedEditorUid || "", 
          title,
          description,
          files: uploadedFiles,
          status: "pending",
          createdAt: Date.now()
        });
      }
      
      cancelEdit();
    } catch (err: any) {
      alert("Failed to save project: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading projects...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "var(--text)" }}>My Projects</h2>
        {!showForm && (
          <button className="crm-button" onClick={() => setShowForm(true)}>
            + New Project
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: "var(--bg-card)", padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 15px 0" }}>{editingId ? "Edit Project" : "New Project"}</h3>
          <div className="form-group">
            <label className="form-label">Project Title</label>
            <input required className="crm-input" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Description / Instructions</label>
            <textarea required className="crm-input" style={{ minHeight: 100 }} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{editingId ? "Add More Attachments (Optional)" : "Attachments (Optional)"}</label>
            <input type="file" multiple className="crm-input" onChange={e => setFiles(Array.from(e.target.files || []))} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={submitting} type="submit" className="crm-button" style={{ flex: 1 }}>
              {submitting ? "Saving..." : (editingId ? "Save Changes" : "Submit Project")}
            </button>
            <button type="button" className="crm-button" style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }} onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        {projects.length === 0 && !showForm && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40, background: "var(--bg-card)", borderRadius: 8 }}>
            No projects submitted yet.
          </div>
        )}
        
        {projects.map(p => (
          <div key={p.id} style={{ background: "var(--bg-card)", padding: 20, borderRadius: 8, border: "1px solid var(--border)", position: "relative" }}>
            
            {p.status === "pending" && !showForm && (
              <div style={{ position: "absolute", top: 15, right: 15, display: "flex", gap: 5 }}>
                <button onClick={() => startEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✏️</button>
                <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>🗑️</button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", paddingRight: p.status === "pending" && !showForm ? 60 : 0 }}>
              <h3 style={{ margin: "0 0 10px 0", color: "var(--text)" }}>{p.title}</h3>
              <span style={{ 
                padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: "bold",
                background: p.status === 'completed' ? '#059669' : (p.status === 'in_progress' ? '#d97706' : '#4b5563'),
                color: '#fff',
                height: "fit-content"
              }}>
                {p.status.toUpperCase()}
              </span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 14, whiteSpace: "pre-wrap", marginTop: 10 }}>{p.description}</p>
            
            {p.files.length > 0 && (
              <div style={{ marginTop: 15 }}>
                <strong style={{ fontSize: 12, color: "var(--text-muted)" }}>YOUR FILES:</strong>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5 }}>
                  {p.files.map((f, i) => (
                    <a key={i} href={f} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--primary)", background: "rgba(99,102,241,0.1)", padding: "4px 8px", borderRadius: 4, textDecoration: "none" }}>
                      Attachment {i+1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {p.status === "completed" && (
              <div style={{ marginTop: 20, padding: 15, background: "rgba(16,185,129,0.1)", borderRadius: 8, borderLeft: "4px solid #10b981" }}>
                <strong style={{ display: "block", marginBottom: 5, color: "#10b981" }}>Admin Review & Delivery:</strong>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text)", whiteSpace: "pre-wrap" }}>{p.reviewNotes || "Project completed."}</p>
                {p.reviewFiles && p.reviewFiles.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                    {p.reviewFiles.map((f, i) => (
                      <a key={i} href={f} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#fff", background: "#10b981", padding: "4px 8px", borderRadius: 4, textDecoration: "none" }}>
                        Download Delivery {i+1}
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
