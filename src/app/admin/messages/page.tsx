"use client";
import { useEffect, useState, useRef } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUsers, UserProfile } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import { ref, set, push, onValue, off, update, get } from "firebase/database";
import { doc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";

interface Message {
  id: string;
  senderId: string;
  senderRole?: string;
  text: string;
  type?: "text" | "photo" | "audio" | "video";
  mediaData?: string;
  timestamp: number;
  status: "sent" | "delivered" | "read";
  readTime?: number;
}

interface ChatMetadata {
  lastMessage?: string;
  lastTimestamp?: number;
  lastSenderId?: string;
  unreadCount?: Record<string, number>;
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [chatTab, setChatTab] = useState<"team" | "clients">("team");
  const [activeChat, setActiveChat] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [chatMetadata, setChatMetadata] = useState<Record<string, ChatMetadata>>({});
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<any>(null);
  const [rtdb, setRtdb] = useState<any>(null);
  const [storageInstance, setStorageInstance] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileView, setIsMobileView] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Audio Recording States (Admin Interventions)
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Form for editing user info
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    whatsappNumber: ""
  });

  // Check screen size for mobile responsiveness
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize Firebase and load users
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    initFirebase().then(async ({ auth, db: firestoreDb, rtdb: realDb, storage: firebaseStorage }) => {
      setRtdb(realDb);
      setStorageInstance(firebaseStorage);
      
      unsubAuth = onAuthStateChanged(auth, async (u) => {
        if (!u) {
          router.push("/login");
          return;
        }
        setDb(firestoreDb);

        const { doc: fsDoc, getDoc } = await import("firebase/firestore");
        const userSnap = await getDoc(fsDoc(firestoreDb, "users", u.uid));
        const profile = userSnap.data() as UserProfile;
        
        // Strict role check for admins only
        if (profile.role !== "admin") {
          router.push("/messages");
          return;
        }
        setCurrentUser(profile);

        // Load all users
        const allUsers = await getUsers();

        // 1. Get all Clients
        const allClients = allUsers.filter(user => user.role === "client");
        setClients(allClients);

        // 2. Get all Team members (except current admin)
        const teamMembers = allUsers.filter(user => user.uid !== profile.uid && user.role !== "client");
        setContacts(teamMembers);
        
        setLoading(false);

        // Listen to metadata for team chats
        teamMembers.forEach(c => {
          const chatId = [profile.uid, c.uid].sort().join("_");
          const metaRef = ref(realDb, `chats/${chatId}/metadata`);
          onValue(metaRef, snap => {
            if (snap.exists()) {
              setChatMetadata(prev => ({
                ...prev,
                [c.uid]: snap.val()
              }));
            }
          });
        });

        // Listen to metadata for bridged client chats
        allClients.forEach(c => {
          const chatId = `bridge_${c.uid}`;
          const metaRef = ref(realDb, `chats/${chatId}/metadata`);
          onValue(metaRef, snap => {
            if (snap.exists()) {
              setChatMetadata(prev => ({
                ...prev,
                [c.uid]: snap.val()
              }));
            }
          });
        });
      });
    });
    return () => unsubAuth?.();
  }, [router]);

  // Handle active chat changes & subscribe to messages
  useEffect(() => {
    if (!currentUser || !activeChat || !rtdb) return;

    const isClientChat = activeChat.role === "client";
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [currentUser.uid, activeChat.uid].sort().join("_");

    const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
    const typingRef = ref(rtdb, `chats/${chatId}/typing`);

    // Reset unread count for current user
    update(ref(rtdb, `chats/${chatId}/metadata/unreadCount`), {
      [currentUser.uid]: 0
    });

    // Listen to messages
    onValue(messagesRef, snap => {
      const msgs: Message[] = [];
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach(key => {
          msgs.push({ id: key, ...data[key] });
        });
        msgs.sort((a, b) => a.timestamp - b.timestamp);

        // Mark incoming messages as read
        let hasUpdates = false;
        const updates: Record<string, any> = {};
        msgs.forEach(m => {
          if (m.senderId !== currentUser.uid && m.status !== "read") {
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
    });

    // Listen to typing status
    onValue(typingRef, snap => {
      if (snap.exists()) {
        setTyping(snap.val());
      } else {
        setTyping({});
      }
    });

    // Set Edit Form values
    setEditForm({
      name: activeChat.name || "",
      email: activeChat.email || "",
      whatsappNumber: (activeChat as any).whatsappNumber || ""
    });

    return () => {
      off(messagesRef);
      off(typingRef);
    };
  }, [activeChat, currentUser, rtdb]);

  // Typing status trigger
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!currentUser || !activeChat || !rtdb) return;
    const isClientChat = activeChat.role === "client";
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [currentUser.uid, activeChat.uid].sort().join("_");
    const myTypingRef = ref(rtdb, `chats/${chatId}/typing/${currentUser.uid}`);
    set(myTypingRef, text.length > 0);
  };

  const triggerSendMessage = async (mediaUrl: string, type: "photo" | "audio" | "video") => {
    if (!activeChat || !currentUser) return;
    try {
      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: activeChat.uid,
          senderId: currentUser.uid,
          senderRole: "admin",
          text: "",
          type,
          mediaData: mediaUrl
        })
      });

      if (!res.ok) throw new Error("API write failed");
    } catch (err) {
      alert("Failed to deliver media draft.");
    }
  };

  // Send Message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser || !activeChat || !rtdb || sending) return;

    // A. Bridged Client Chat Routing (Intervene as Manager/Admin)
    if (activeChat.role === "client") {
      setSending(true);
      const textToSend = inputText;
      setInputText("");

      set(ref(rtdb, `chats/bridge_${activeChat.uid}/typing/${currentUser.uid}`), false);

      try {
        const res = await fetch("/api/chat/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: activeChat.uid,
            senderId: currentUser.uid,
            senderRole: "admin",
            text: textToSend,
            type: "text"
          })
        });

        if (!res.ok) throw new Error("API write failed");
      } catch (err) {
        alert("Failed to deliver message via security filter.");
        setInputText(textToSend);
      } finally {
        setSending(false);
      }
      return;
    }

    // B. Team Chats (Direct Writes)
    const chatId = [currentUser.uid, activeChat.uid].sort().join("_");
    const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
    const newMsgRef = push(messagesRef);

    const messageData = {
      senderId: currentUser.uid,
      text: inputText,
      timestamp: Date.now(),
      status: "sent"
    };

    await set(newMsgRef, messageData);

    const metaRef = ref(rtdb, `chats/${chatId}/metadata`);
    const currentUnread = chatMetadata[activeChat.uid]?.unreadCount?.[activeChat.uid] || 0;

    await update(metaRef, {
      lastMessage: inputText,
      lastTimestamp: Date.now(),
      lastSenderId: currentUser.uid,
      [`unreadCount/${activeChat.uid}`]: currentUnread + 1
    });

    set(ref(rtdb, `chats/${chatId}/typing/${currentUser.uid}`), false);
    setInputText("");
  };

  // Cloud Storage selector supporting progress tracking
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !activeChat || sending) return;

    const fileType = file.type;
    const isImage = fileType.startsWith("image/");
    const isVideo = fileType.startsWith("video/");
    const typeLabel = isVideo ? "video" : "photo";

    // A. Native Cloud Storage upload with progress bar
    if (storageInstance) {
      setSending(true);
      setUploadProgress(0);

      const path = `bridges/${activeChat.uid}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storageInstance, path);
      const uploadTask = uploadBytesResumable(sRef, file);

      uploadTask.on("state_changed",
        (snap) => {
          const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        async (error) => {
          console.error("Cloud storage upload failed, running fallbacks:", error);
          setUploadProgress(null);
          
          if (isImage) {
            runBase64ImageFallback(file);
          } else {
            alert("Video sharing failed. Configure Firebase Storage.");
            setSending(false);
          }
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
      alert("Sharing video files requires Firebase Storage.");
    }
  };

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

  // Base64 Audio Recorder Loop
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

        // A. Native Cloud Storage upload
        if (storageInstance && activeChat) {
          setSending(true);
          setUploadProgress(0);

          const path = `bridges/${activeChat.uid}/${fileName}`;
          const sRef = storageRef(storageInstance, path);
          const uploadTask = uploadBytesResumable(sRef, audioBlob);

          uploadTask.on("state_changed",
            (snap) => {
              const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
              setUploadProgress(Math.round(progress));
            },
            async (err) => {
              console.error("Audio cloud upload failed, running Base64 fallback:", err);
              setUploadProgress(null);
              runBase64AudioFallback(audioBlob);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              setUploadProgress(null);
              await triggerSendMessage(downloadURL, "audio");
              setSending(false);
            }
          );
          return;
        }

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

  // Save edited user profile information
  const saveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeChat) return;

    try {
      await updateDoc(doc(db, "users", activeChat.uid), {
        name: editForm.name,
        email: editForm.email,
        whatsappNumber: editForm.whatsappNumber
      });

      // Update local state
      setActiveChat(prev => prev ? {
        ...prev,
        name: editForm.name,
        email: editForm.email,
        whatsappNumber: editForm.whatsappNumber
      } as any : null);

      setContacts(prev => prev.map(c => c.uid === activeChat.uid ? {
        ...c,
        name: editForm.name,
        email: editForm.email,
        whatsappNumber: editForm.whatsappNumber
      } as any : c));

      setClients(prev => prev.map(c => c.uid === activeChat.uid ? {
        ...c,
        name: editForm.name,
        email: editForm.email,
        whatsappNumber: editForm.whatsappNumber
      } as any : c));

      setIsEditingInfo(false);
    } catch (err: any) {
      alert("Error updating profile: " + err.message);
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const visibleContacts = chatTab === "team" ? contacts : clients;

  const filteredContacts = visibleContacts.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.name ?? "").toLowerCase().includes(q) ||
           (c.email ?? "").toLowerCase().includes(q);
  });

  if (loading || !currentUser) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>⏳ Loading Secure Admin Messages…</div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
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

      {/* ── Left Sidebar (Contact list) ── */}
      {(!activeChat || !isMobileView) && (
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Admin Secure Chat</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Real-time team chat &amp; task updates</p>
          </div>

          {/* Tab Selector */}
          <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
            <button
              onClick={() => { setChatTab("team"); setActiveChat(null); }}
              className={`btn btn-sm ${chatTab === "team" ? "btn-primary" : "btn-ghost"}`}
              style={{ flex: 1, fontSize: 12, borderRadius: 8, height: 32 }}
            >
              👥 Team Contacts
            </button>
            <button
              onClick={() => { setChatTab("clients"); setActiveChat(null); }}
              className={`btn btn-sm ${chatTab === "clients" ? "btn-primary" : "btn-ghost"}`}
              style={{ flex: 1, fontSize: 12, borderRadius: 8, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
            >
              💼 Bridged Clients ({clients.length})
            </button>
          </div>

          <div style={{ padding: "0 16px 12px" }}>
            <div className="search-wrap" style={{ width: "100%" }}>
              <span className="search-icon">🔍</span>
              <input
                className="crm-input"
                placeholder="Search contacts…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="chat-contact-list">
            {filteredContacts.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No active conversations found here.
              </div>
            ) : (
              filteredContacts.map(c => {
                const meta = chatMetadata[c.uid] || {};
                const isUserTyping = typing[c.uid];
                const unreadCount = meta.unreadCount?.[currentUser.uid] || 0;

                return (
                  <div
                    key={c.uid}
                    onClick={() => { setActiveChat(c); setShowInfo(false); }}
                    className={`chat-contact-item${activeChat?.uid === c.uid ? " active" : ""}`}
                  >
                    <div className="chat-contact-avatar">
                      {c.role === "client" ? "💼" : (c.name || c.email || "U")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
                          {c.role === "client" ? `Client: ${c.name || c.email}` : (c.name || c.email)}
                        </div>
                        {meta.lastTimestamp && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {formatDate(meta.lastTimestamp)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <div style={{ fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {isUserTyping ? (
                            <span style={{ color: "#a78bfa", fontWeight: 500 }}>typing…</span>
                          ) : (
                            meta.lastMessage || c.email
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <div className="chat-unread-badge">{unreadCount}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Main Chat Area ── */}
      {(activeChat || !isMobileView) ? (
        <div className="chat-main" style={{ display: activeChat ? "flex" : isMobileView ? "none" : "flex" }}>
          {activeChat ? (
            <>
              {/* Header */}
              <div className="chat-header">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {isMobileView && (
                    <button
                      onClick={() => setActiveChat(null)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                  )}
                  <div className="chat-contact-avatar" style={{ width: 38, height: 38, fontSize: 14 }}>
                    {activeChat.role === "client" ? "💼" : (activeChat.name || activeChat.email || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {activeChat.role === "client" ? `Intervening Client Channel: ${activeChat.name || activeChat.email}` : (activeChat.name || activeChat.email)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize" }}>
                      {typing[activeChat.uid] ? (
                        <span style={{ color: "#a78bfa", fontWeight: 500 }}>typing…</span>
                      ) : (
                        activeChat.role.replace("_", " ")
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className={`btn btn-sm ${showInfo ? "btn-primary" : "btn-ghost"}`}
                  style={{ borderRadius: 99, padding: "6px 12px" }}
                >
                  ℹ️ Info
                </button>
              </div>

              {/* Message List */}
              <div className="chat-messages-area">
                {messages.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>No messages yet</div>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Send a message to start conversation securely.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {messages.map((m, idx) => {
                      const isMe = m.senderId === currentUser.uid;
                      const showDateHeader = idx === 0 || formatDate(m.timestamp) !== formatDate(messages[idx - 1]?.timestamp);

                      const senderTag = activeChat.role === "client" && !isMe 
                        ? (m.senderRole === "client" ? " [Client]" : " [Editor Proxy]") 
                        : "";

                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                          {showDateHeader && (
                            <div className="chat-date-header">
                              <span>{formatDate(m.timestamp)}</span>
                            </div>
                          )}

                          <div className={`chat-message-bubble-wrapper ${isMe ? "sent" : "received"}`}>
                            <div className={`chat-bubble ${isMe ? "sent" : "received"}`}>
                              
                              {activeChat.role === "client" && !isMe && (
                                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 4 }}>
                                  {senderTag}
                                </div>
                              )}

                              {(m.type === "text" || !m.type) ? (
                                <div style={{ wordBreak: "break-word", fontSize: 13.5 }}>{m.text}</div>
                              ) : null}

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

                              {m.type === "audio" && m.mediaData ? (
                                <div style={{ marginTop: 2, width: 220, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                                  <audio src={m.mediaData} controls style={{ width: "100%", height: 32 }} />
                                </div>
                              ) : null}

                              {/* Render videos */}
                              {m.type === "video" && m.mediaData ? (
                                <div style={{ marginTop: 2, borderRadius: 8, overflow: "hidden", width: "100%", maxWidth: 320, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", padding: 8 }}>
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                                    🎥 Video Draft
                                  </div>
                                  <video src={m.mediaData} controls style={{ width: "100%", borderRadius: 6, display: "block" }} />
                                  <a 
                                    href={m.mediaData} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="btn btn-secondary btn-sm" 
                                    style={{ width: "100%", marginTop: 8, height: 28, fontSize: 11.5, textDecoration: "none", justifyContent: "center" }}
                                  >
                                    ⬇️ Download Video File
                                  </a>
                                </div>
                              ) : null}

                              <div className="chat-bubble-footer">
                                <span>{formatTime(m.timestamp)}</span>
                                {isMe && (
                                  <span
                                    title={m.status === "read" && m.readTime ? `Read at ${new Date(m.readTime).toLocaleString()}` : m.status}
                                    style={{ display: "flex", marginLeft: 4 }}
                                  >
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
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Message Input Area */}
              {activeChat.role === "client" && isRecording ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 16px", height: 42, margin: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f87171", fontSize: 13, fontWeight: 600 }}>
                    <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }}></span>
                    Recording Voice: {formatDuration(recordDuration)}
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
                <form onSubmit={sendMessage} className="chat-input-area">
                  {activeChat.role === "client" && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        accept="image/*,video/*"
                        onChange={handlePhotoSelect}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                        title="Share Media File"
                      >
                        📷
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={startRecording}
                        disabled={sending}
                        title="Record Voice"
                      >
                        🎤
                      </button>
                    </>
                  )}
                  <input
                    className="crm-input"
                    placeholder={sending ? "Intervening bridge..." : "Type a message…"}
                    value={inputText}
                    onChange={e => handleInputChange(e.target.value)}
                    style={{ flex: 1, height: 42, background: "rgba(0,0,0,0.2)" }}
                    disabled={sending}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: "0 16px", height: 42 }} disabled={sending}>
                    {sending ? "..." : "Send"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>SkillBridge Admin Secure Chat</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, maxWidth: 300, textAlign: "center", lineHeight: 1.5 }}>
                Real-time end-to-end messaging network. Select a team member to begin communicating securely.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Right Panel (User Details / Info) ── */}
      {showInfo && activeChat && (
        <div className="chat-info-sidebar">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Contact Details</div>
            <button
              onClick={() => { setShowInfo(false); setIsEditingInfo(false); }}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
            <div className="chat-contact-avatar" style={{ width: 70, height: 70, fontSize: 24 }}>
              {activeChat.role === "client" ? "💼" : (activeChat.name || activeChat.email || "U")[0].toUpperCase()}
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{activeChat.name || activeChat.email}</h3>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, textTransform: "capitalize" }}>
                {activeChat.role.replace("_", " ")}
              </p>
            </div>
          </div>

          <div style={{ padding: "0 20px 24px" }}>
            {!isEditingInfo ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Email Address</label>
                  <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 2 }}>{activeChat.email}</div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>WhatsApp Number</label>
                  <div style={{ fontSize: 13.5, color: "var(--text)", marginTop: 2 }}>
                    {(activeChat as any).whatsappNumber || (
                      <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Not provided</span>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>User ID</label>
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", marginTop: 2 }}>
                    {activeChat.uid}
                  </div>
                </div>

                <button
                  onClick={() => setIsEditingInfo(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12 }}
                >
                  ✏️ Edit Profile Details
                </button>
              </div>
            ) : (
              <form onSubmit={saveContactInfo} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 11 }}>Full Name</label>
                  <input
                    className="crm-input"
                    value={editForm.name}
                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 11 }}>Email Address</label>
                  <input
                    className="crm-input"
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 11 }}>WhatsApp Number</label>
                  <input
                    className="crm-input"
                    placeholder="e.g. +91 98765 43210"
                    value={editForm.whatsappNumber}
                    onChange={e => setEditForm(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingInfo(false)}
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
