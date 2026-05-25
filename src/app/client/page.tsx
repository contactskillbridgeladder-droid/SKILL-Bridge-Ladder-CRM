"use client";
import React, { useEffect, useState, useRef } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ref, onValue, off, set, update, get } from "firebase/database";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";

interface Message {
  id: string;
  senderId: string;
  senderRole: string;
  text: string;
  type?: "text" | "photo" | "audio" | "video";
  mediaData?: string; // holds download URL or Base64 fallback payload
  timestamp: number;
  status: "sent" | "delivered" | "read";
  readTime?: number;
}

export default function ClientWorkspace() {
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [managerTyping, setManagerTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rtdb, setRtdb] = useState<any>(null);
  const [storageInstance, setStorageInstance] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Photo selection states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    initFirebase().then(({ auth, db, rtdb: realDb, storage: firebaseStorage }) => {
      setRtdb(realDb);
      setStorageInstance(firebaseStorage);
      
      unsubAuth = onAuthStateChanged(auth, async (u) => {
        if (!u) return;

        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const profile = userSnap.data();
          setUser(profile);

          const chatId = `bridge_${u.uid}`;
          const messagesRef = ref(realDb, `chats/${chatId}/messages`);
          const typingRef = ref(realDb, `chats/${chatId}/typing`);

          // Subscribe to messages
          onValue(messagesRef, snap => {
            const msgs: Message[] = [];
            if (snap.exists()) {
              const data = snap.val();
              Object.keys(data).forEach(key => {
                msgs.push({ id: key, ...data[key] });
              });
              msgs.sort((a, b) => a.timestamp - b.timestamp);

              // Mark incoming editor/admin messages as read
              let hasUpdates = false;
              const updates: Record<string, any> = {};
              msgs.forEach(m => {
                if (m.senderId !== u.uid && m.status !== "read") {
                  updates[`${m.id}/status`] = "read";
                  updates[`${m.id}/readTime`] = Date.now();
                  hasUpdates = true;
                }
              });

              if (hasUpdates) {
                update(messagesRef, updates);
              }
            }
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            setLoading(false);
          });

          // Reset unread count for client upon loading
          update(ref(realDb, `chats/${chatId}/metadata/unreadCount`), {
            [u.uid]: 0
          });

          // Listen to typing status
          onValue(typingRef, snap => {
            if (snap.exists()) {
              const typingData = snap.val();
              setTyping(typingData);

              // Check if editor or admin (Manager) is typing
              const typingKeys = Object.keys(typingData);
              const isManagerActive = typingKeys.some(key => key !== u.uid && typingData[key] === true);
              setManagerTyping(isManagerActive);
            } else {
              setTyping({});
              setManagerTyping(false);
            }
          });
        }
      });
    });

    return () => {
      unsubAuth?.();
      if (rtdb && user) {
        off(ref(rtdb, `chats/bridge_${user.uid}/messages`));
        off(ref(rtdb, `chats/bridge_${user.uid}/typing`));
      }
      clearInterval(recordingTimerRef.current);
    };
  }, [rtdb]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!user || !rtdb) return;
    const typingRef = ref(rtdb, `chats/bridge_${user.uid}/typing/${user.uid}`);
    set(typingRef, text.length > 0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || sending) return;

    setSending(true);
    const textToSend = inputText;
    setInputText("");

    // Clear typing status
    if (rtdb) {
      set(ref(rtdb, `chats/bridge_${user.uid}/typing/${user.uid}`), false);
    }

    try {
      const { auth } = await initFirebase();
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: user.uid,
          senderId: user.uid,
          senderRole: "client",
          text: textToSend,
          type: "text"
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send message via security filters");
      }
    } catch (err: any) {
      alert("Error sending message: " + (err.message || "check connection or disallowed contact/payment info."));
      setInputText(textToSend); // restore input
    } finally {
      setSending(false);
    }
  };

  // Helper function to dispatch secure messages
  const triggerSendMessage = async (mediaUrl: string, type: "photo" | "audio" | "video") => {
    try {
      const { auth } = await initFirebase();
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: user.uid,
          senderId: user.uid,
          senderRole: "client",
          text: "",
          type,
          mediaData: mediaUrl
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Blocked by security scanner");
      }
    } catch (err: any) {
      alert("Media sharing failed safety/moderation validation: " + err.message);
    }
  };

  // Generic File Selector supporting Cloud Storage uploads with progress bars
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || sending) return;

    const fileType = file.type;
    const isImage = fileType.startsWith("image/");
    const isVideo = fileType.startsWith("video/");
    const typeLabel = isVideo ? "video" : "photo";

    // B. Base64 fallback (Only for images, avoids Firebase Storage limit completely)
    if (isImage) {
      runBase64ImageFallback(file);
      return;
    }

    // A. Native Cloud Storage upload for Videos (Requires Firebase Storage setup)
    if (storageInstance) {
      setSending(true);
      setUploadProgress(0);

      const path = `bridges/${user.uid}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storageInstance, path);
      const uploadTask = uploadBytesResumable(sRef, file);

      uploadTask.on("state_changed",
        (snap) => {
          const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        async (error) => {
          console.error("Cloud storage upload failed:", error);
          setUploadProgress(null);
          alert("Video uploads require Firebase Storage activation. Please verify your Firebase project console.");
          setSending(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadProgress(null);
          await triggerSendMessage(downloadURL, typeLabel);
          setSending(false);
        }
      );
      return;
    }

    // B. Base64 fallback (Only for images)
    if (isImage) {
      runBase64ImageFallback(file);
    } else {
      alert("Sharing raw video files requires Cloud Storage configuration. Fallback restricted to photos.");
    }
  };

  // Base64 Photo fallback compressor
  const runBase64ImageFallback = (file: File) => {
    setSending(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        await triggerSendMessage(compressedBase64, "photo");
        setSending(false);
      };
    };
    reader.readAsDataURL(file);
  };

  // HTML5 Voice Note recorder pipeline
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: "audio/webm" };
      let mediaRecorder;

      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch {
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const fileName = `voice_note_${Date.now()}.webm`;
        // B. Base64 Audio fallback (100% Free option, skips Firebase Storage limits)
        runBase64AudioFallback(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordDuration(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      alert("Microphone permission denied.");
    }
  };

  const runBase64AudioFallback = (audioBlob: Blob) => {
    setSending(true);
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      if (base64Audio) {
        await triggerSendMessage(base64Audio, "audio");
      }
      setSending(false);
    };
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading || !user) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>⏳ Loading Client Workspace…</div>
      </div>
    );
  }

  return (
    <div className="chat-layout animate-fade" style={{ height: "calc(100vh - 64px)" }}>
      {/* Floating Progress Bar Banner */}
      {uploadProgress !== null && (
        <div style={{
          position: "fixed", top: 80, right: 24,
          background: "var(--bg-card)", border: "1px solid var(--border-bright)",
          borderRadius: 12, padding: "14px 20px", width: 280, zIndex: 110,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 8
        }} className="animate-fade">
          <div style={{ fontSize: 12.5, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
            <span>📤 Uploading to Cloud Storage...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${uploadProgress}%`, height: "100%", background: "linear-gradient(90deg,#7c3aed,#3b82f6)", transition: "width 0.2s ease" }}></div>
          </div>
        </div>
      )}

      {/* Sidebar contact info */}
      <div className="chat-sidebar" style={{ maxWidth: 300, borderRight: "1px solid var(--border)" }}>
        <div className="chat-sidebar-header">
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Client Workspace</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Brand Manager Active Connection</p>
        </div>

        <div className="chat-contact-list" style={{ padding: "8px 12px" }}>
          <div className="chat-contact-item active" style={{ cursor: "default" }}>
            <div className="chat-contact-avatar" style={{ background: "linear-gradient(135deg,#7c3aed,#3b82f6)" }}>
              💼
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Agency Manager</div>
              <div style={{ fontSize: 11.5, color: "#a78bfa", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <span className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                Securely Connected
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, marginTop: "auto", borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.1)", borderRadius: 12, margin: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            🛡️ AI Secure Scanner Active
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
            To safeguard our workflows, our security engine monitors this chat. Only Google Drive links are permitted. Direct contact attempts are blocked.
          </p>
        </div>
      </div>

      {/* Main chat window */}
      <div className="chat-main">
        {/* Header */}
        <div className="chat-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="chat-contact-avatar" style={{ width: 38, height: 38, background: "linear-gradient(135deg,#7c3aed,#3b82f6)" }}>
              💼
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Agency Manager</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {managerTyping ? (
                  <span style={{ color: "#a78bfa", fontWeight: 600 }}>typing…</span>
                ) : (
                  "Active Loop"
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages-area" style={{ background: "var(--bg-surface)" }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>⚡</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Welcome to SkillBridge Secure Portal</div>
              <p style={{ fontSize: 12, marginTop: 4, maxWidth: 300, textAlign: "center", lineHeight: 1.5 }}>
                Your project channel is active! Post your video assets, instructions, or reviews directly here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((m) => {
                const isMe = m.senderId === user.uid;

                return (
                  <div key={m.id} className={`chat-message-bubble-wrapper ${isMe ? "sent" : "received"}`}>
                    <div className={`chat-bubble ${isMe ? "sent" : "received"}`} style={{
                      background: isMe ? "linear-gradient(135deg,rgba(124,58,237,0.7),rgba(59,130,246,0.7))" : "rgba(255,255,255,0.05)",
                      border: isMe ? "1px solid rgba(124,58,237,0.3)" : "1px solid var(--border)",
                      borderRadius: 14,
                      padding: "10px 14px"
                    }}>
                      {/* Render text messages */}
                      {(m.type === "text" || !m.type) ? (
                        <div style={{ wordBreak: "break-word", fontSize: 13.5, lineHeight: 1.5 }}>{m.text}</div>
                      ) : null}

                      {/* Render photos */}
                      {m.type === "photo" && m.mediaData ? (
                        <div style={{ marginTop: 2, borderRadius: 8, overflow: "hidden", cursor: "zoom-in" }}>
                          <img
                            src={m.mediaData}
                            alt="Shared Asset"
                            style={{ maxWidth: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8, display: "block" }}
                            onClick={() => {
                              const w = window.open();
                              w?.document.write(`<img src="${m.mediaData}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                            }}
                          />
                        </div>
                      ) : null}

                      {/* Render custom Voice Note player */}
                      {m.type === "audio" && m.mediaData ? (
                        <div style={{ marginTop: 2, width: 220, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                            🎤 Voice Note
                          </div>
                          <audio
                            src={m.mediaData}
                            controls
                            style={{ width: "100%", height: 32 }}
                          />
                        </div>
                      ) : null}

                      {/* Render raw video submissions */}
                      {m.type === "video" && m.mediaData ? (
                        <div style={{ marginTop: 2, borderRadius: 8, overflow: "hidden", width: "100%", maxWidth: 320, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", padding: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                            🎥 Video Draft
                          </div>
                          <video
                            src={m.mediaData}
                            controls
                            style={{ width: "100%", borderRadius: 6, display: "block" }}
                          />
                          <a 
                            href={m.mediaData} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn btn-secondary btn-sm" 
                            style={{ width: "100%", marginTop: 8, height: 28, fontSize: 11.5, justifyContent: "center", textDecoration: "none" }}
                          >
                            ⬇️ Download Video File
                          </a>
                        </div>
                      ) : null}

                      <div className="chat-bubble-footer" style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                        <span>{formatTime(m.timestamp)}</span>
                        {isMe && (
                          <span style={{ display: "flex" }}>
                            {m.status === "sent" ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : m.status === "delivered" ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="3"><polyline points="17 6 8.5 15.5 5 12"/><polyline points="22 6 13.5 15.5 11 13"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="3"><polyline points="17 6 8.5 15.5 5 12"/><polyline points="22 6 13.5 15.5 11 13"/></svg>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input panel with dynamic recording controls */}
        <div className="chat-input-area" style={{ background: "rgba(9,9,11,0.8)", borderTop: "1px solid var(--border)", position: "relative" }}>
          {isRecording ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 16px", height: 42 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f87171", fontSize: 13, fontWeight: 600 }}>
                <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }}></span>
                Recording Voice Note: {formatDuration(recordDuration)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: "#ef4444", height: 28, fontSize: 11, padding: "0 10px" }}
                  onClick={() => {
                    setIsRecording(false);
                    clearInterval(recordingTimerRef.current);
                    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ height: 28, fontSize: 11, padding: "0 10px", background: "#ef4444" }}
                  onClick={stopRecording}
                >
                  Send Voice
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} style={{ flex: 1, display: "flex", gap: 10, alignItems: "center" }}>
              {/* Media tools */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*,video/*"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => fileInputRef.current?.click()}
                title="Share Media Asset (Photos / Videos)"
                disabled={sending}
              >
                📷
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={startRecording}
                title="Record Audio note"
                disabled={sending}
              >
                🎤
              </button>

              <input
                className="crm-input"
                placeholder={sending ? "Securing message transmission..." : "Type a message securely..."}
                value={inputText}
                onChange={e => handleInputChange(e.target.value)}
                style={{ flex: 1, height: 42, background: "rgba(0,0,0,0.3)" }}
                disabled={sending}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: "0 16px", height: 42, borderRadius: 10 }}
                disabled={sending || !inputText.trim()}
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
