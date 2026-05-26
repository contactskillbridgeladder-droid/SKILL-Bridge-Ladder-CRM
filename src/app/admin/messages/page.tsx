"use client";
import { useEffect, useState, useRef } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getUsers, UserProfile } from "@/lib/firestore";
import { useRouter } from "next/navigation";
import { ref, set, push, onValue, off, update, get, remove, query, limitToLast } from "firebase/database";
import { doc, updateDoc } from "firebase/firestore";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";

interface Message {
  id: string;
  senderId: string;
  senderRole?: string;
  text: string;
  type?: "text" | "photo" | "audio" | "video" | "document";
  mediaData?: string;
  fileName?: string;
  timestamp: number;
  status: "sent" | "delivered" | "read";
  editedAt?: number;
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
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
  const [proxyRole, setProxyRole] = useState<"admin" | "editor" | "client">("admin");

  // Audio Recording States (Admin Interventions)
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
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

    setProxyRole("admin"); // Reset proxy role on chat change

    const isClientChat = activeChat.role === "client";
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [(currentUser?.uid || "unknown"), activeChat.uid].sort().join("_");

    const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
    const typingRef = ref(rtdb, `chats/${chatId}/typing`);

    // Reset unread count for current user
    update(ref(rtdb, `chats/${chatId}/metadata/unreadCount`), {
      [(currentUser?.uid || "unknown")]: 0
    });

    // Listen to messages
    const recentQuery = query(messagesRef, limitToLast(50));
    onValue(recentQuery, snap => {
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
          if (m.senderId !== (currentUser?.uid || "unknown") && m.status !== "read") {
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
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [(currentUser?.uid || "unknown"), activeChat.uid].sort().join("_");
    const myTypingRef = ref(rtdb, `chats/${chatId}/typing/${(currentUser?.uid || "unknown")}`);
    set(myTypingRef, text.length > 0);
  };

  const triggerSendMessage = async (mediaUrl: string, type: "photo" | "audio" | "video" | "document", extraData?: any) => {
    if (!activeChat || !currentUser) return;
    try {
      const { auth } = await initFirebase();
      const token = await auth.currentUser?.getIdToken();

      let resolvedSenderId = (currentUser?.uid || "unknown");
      let resolvedSenderRole = "admin";

      if (activeChat.role === "client") {
        if (proxyRole === "client") {
          resolvedSenderId = activeChat.uid;
          resolvedSenderRole = "client";
        } else if (proxyRole === "editor") {
          resolvedSenderId = activeChat.assignedEditorUid || (currentUser?.uid || "unknown");
          resolvedSenderRole = "editor";
        }
      }

      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: activeChat.uid,
          senderId: resolvedSenderId,
          senderRole: resolvedSenderRole,
          text: "",
          type,
          mediaData: mediaUrl, fileName: extraData?.fileName
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "API write failed");
      }
    } catch (err: any) {
      alert("Failed to deliver media draft: " + err.message);
    }
  };

  const handleEditClick = (m: any) => {
    setEditingMessageId(m.id);
    setInputText(m.text || "");
    setMenuOpenId(null);
  };

  // Send Message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser || !activeChat || !rtdb || sending) return;

    // A. Bridged Client Chat Routing (Intervene as Manager/Admin)
    if (activeChat.role === "client") {
      setSending(true);
      const textToSend = inputText;
      const editId = editingMessageId;
      setInputText("");
    setEditingMessageId(null);

      set(ref(rtdb, `chats/bridge_${activeChat.uid}/typing/${(currentUser?.uid || "unknown")}`), false);

      try {
        const { auth } = await initFirebase();
        const token = await auth.currentUser?.getIdToken();

        let resolvedSenderId = (currentUser?.uid || "unknown");
        let resolvedSenderRole = "admin";

        if (proxyRole === "client") {
          resolvedSenderId = activeChat.uid;
          resolvedSenderRole = "client";
        } else if (proxyRole === "editor") {
          resolvedSenderId = activeChat.assignedEditorUid || (currentUser?.uid || "unknown");
          resolvedSenderRole = "editor";
        }

        const res = await fetch("/api/chat/send-message", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            clientId: activeChat.uid,
            senderId: resolvedSenderId,
            senderRole: resolvedSenderRole,
            text: textToSend,
            type: "text"
          , editingMessageId: editId})
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "API write failed");
        }
      } catch (err: any) {
        alert("Failed to deliver message via security filter: " + err.message);
        setInputText(textToSend);
      } finally {
        setSending(false);
      }
      return;
    }

    // B. Team Chats (Direct Writes)
    const chatId = [(currentUser?.uid || "unknown"), activeChat.uid].sort().join("_");
    const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
    if (editingMessageId) {
      await update(ref(rtdb, `chats/${chatId}/messages/${editingMessageId}`), {
        text: inputText,
        editedAt: Date.now()
      });
      setEditingMessageId(null);
    } else {
      const newMsgRef = push(messagesRef);
      const messageData = {
        senderId: (currentUser?.uid || "unknown"),
        text: inputText,
        timestamp: Date.now(),
        status: "sent"
      };
      await set(newMsgRef, messageData);
    }

    const metaRef = ref(rtdb, `chats/${chatId}/metadata`);
    const currentUnread = chatMetadata[activeChat.uid]?.unreadCount?.[activeChat.uid] || 0;

    await update(metaRef, {
      lastMessage: inputText,
      lastTimestamp: Date.now(),
      lastSenderId: (currentUser?.uid || "unknown"),
      [`unreadCount/${activeChat.uid}`]: currentUnread + 1
    });

    set(ref(rtdb, `chats/${chatId}/typing/${(currentUser?.uid || "unknown")}`), false);
    setInputText("");
    setEditingMessageId(null);
  };

  // Media / File selector supporting Cloud Storage & Base64 fallbacks
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !activeChat || sending) return;

    const fileType = file.type;
    const isImage = fileType.startsWith("image/");
    const isVideo = fileType.startsWith("video/");
    const isDoc = !isImage && !isVideo;
    const typeLabel = isVideo ? "video" : (isDoc ? "document" : "photo");

    // For the completely free option, we will store images natively inside the Realtime Database using Base64.
    if (isImage) {
      runBase64ImageFallback(file);
      return;
    }

    if (isDoc) {
      if (file.size > 4 * 1024 * 1024) {
        alert("Document is too large. Max allowed size for free sharing is 4MB.");
        return;
      }
      runBase64DocumentFallback(file);
      return;
    }

    // A. Native Cloud Storage upload with progress bar
    if (storageInstance && activeChat) {
      setSending(true);
      setUploadProgress(0);

      try {
        const downloadURL = await uploadToCloudinary(file, isVideo ? "video" : "auto", (p) => setUploadProgress(p));
        setUploadProgress(null);
        await triggerSendMessage(downloadURL, isVideo ? "video" : "photo");
      } catch (error: any) {
        console.error("Cloudinary upload failed:", error);
        setUploadProgress(null);
        alert("Video sharing failed: " + error.message);
      }
      setSending(false);
      return;
    }

    alert("Sharing video files requires Firebase Storage.");
  };

  const runBase64DocumentFallback = (file: File) => {
    setSending(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Doc = reader.result as string;
      if (base64Doc) {
        await triggerSendMessage(base64Doc, "document", { fileName: file.name });
      }
      setSending(false);
    };
    reader.readAsDataURL(file);
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
        const nativeType = audioChunksRef.current[0]?.type || "audio/mp4";
        const audioBlob = new Blob(audioChunksRef.current, { type: nativeType });
        const fileName = `voice_note_${Date.now()}.mp4`;

        setSending(true);
        try {
          const publicUrl = await uploadToCloudinary(audioBlob, "video");
          await triggerSendMessage(publicUrl, "audio");
        } catch (err: any) {
          console.error("Audio Upload Error:", err);
          alert("Failed to upload audio: " + err.message);
        } finally {
          setSending(false);
        }
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
      mediaRecorderRef.current.stream.getTracks().forEach((track: any) => track.stop());
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

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Delete this message?")) return;
    if (!rtdb || !activeChat || !currentUser) return;
    const isClientChat = activeChat.role === "client";
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [(currentUser?.uid || "unknown"), activeChat.uid].sort().join("_");
    try {
      await remove(ref(rtdb, `chats/${chatId}/messages/${msgId}`));
    } catch (e: any) {
      alert("Failed to delete message: " + e.message);
    }
  };

  const clearChat = async () => {
    if (!confirm("Are you sure you want to delete ALL messages in this chat? This cannot be undone.")) return;
    if (!rtdb || !activeChat || !currentUser) return;
    const isClientChat = activeChat.role === "client";
    const chatId = isClientChat ? `bridge_${activeChat.uid}` : [(currentUser?.uid || "unknown"), activeChat.uid].sort().join("_");
    try {
      await remove(ref(rtdb, `chats/${chatId}/messages`));
    } catch (e: any) {
      alert("Failed to clear chat: " + e.message);
    }
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
                const unreadCount = meta.unreadCount?.[(currentUser?.uid || "unknown")] || 0;

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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {activeChat.role === "client" ? `Intervening Client Channel: ${activeChat.name || activeChat.email}` : (activeChat.name || activeChat.email)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {typing[activeChat.uid] ? (
                        <span style={{ color: "#a78bfa", fontWeight: 500 }}>typing…</span>
                      ) : (
                        activeChat.role.replace("_", " ")
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {currentUser.role === 'admin_msg_only' && (
                    <button
                      onClick={async () => {
                        const { auth } = await import('@/lib/firebase').then(m=>m.initFirebase());
                        await signOut(auth);
                        window.location.href = '/login';
                      }}
                      className="btn btn-sm btn-ghost"
                      style={{ borderRadius: 99, padding: '6px 12px', color: '#f87171' }}
                    >
                      🚪 Logout
                    </button>
                  )}
                  <button
                    onClick={() => setShowInfo(!showInfo)}
                    className={`btn btn-sm ${showInfo ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: 99, padding: "6px 12px" }}
                  >
                    ℹ️ Info
                  </button>
                </div>
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
                      let isMe = m.senderId === (currentUser?.uid || "unknown");
                      const showDateHeader = idx === 0 || formatDate(m.timestamp) !== formatDate(messages[idx - 1]?.timestamp);

                      let senderTag = "";

                      if (activeChat.role === "client") {
                        if (proxyRole === "admin") {
                          isMe = m.senderRole === "admin";
                          if (!isMe) {
                            senderTag = m.senderRole === "client" ? " [Client]" : " [Editor Proxy]";
                          }
                        } else if (proxyRole === "editor") {
                          isMe = m.senderRole === "editor";
                          if (!isMe) {
                            senderTag = m.senderRole === "client" ? " [Client]" : " [Admin/Manager]";
                          }
                        } else if (proxyRole === "client") {
                          isMe = m.senderRole === "client";
                          if (!isMe) {
                            senderTag = " [Agency Manager]";
                          }
                        }
                      } else {
                        isMe = m.senderId === (currentUser?.uid || "unknown");
                      }

                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                          {showDateHeader && (
                            <div className="chat-date-header">
                              <span>{formatDate(m.timestamp)}</span>
                            </div>
                          )}

                            <div className={`chat-message-bubble-wrapper ${isMe ? "sent" : "received"}`} style={{ position: "relative" }} onContextMenu={(e) => { e.preventDefault(); setMenuOpenId(menuOpenId === m.id ? null : m.id); }}>
                              
                              <div style={{ position: "absolute", top: 4, [isMe ? 'right' : 'left']: isMe ? "100%" : "100%", padding: "0 8px", zIndex: 5 }}>
                                <button 
                                  type="button"
                                  onClick={() => setMenuOpenId(menuOpenId === m.id ? null : m.id)} 
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", height: 32, opacity: 0.6 }}
                                  title="Options"
                                >
                                  ⋮
                                </button>
                                {menuOpenId === m.id && (
                                  <div style={{ position: "absolute", top: "100%", [isMe ? 'right' : 'left']: 0, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 8, padding: 4, zIndex: 50, display: "flex", flexDirection: "column", gap: 4, minWidth: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
                                    {(isMe && (m.type === "text" || !m.type)) && (
                                      <button type="button" onClick={() => handleEditClick(m)} style={{ background: "none", border: "none", padding: "8px 12px", textAlign: "left", fontSize: 13, cursor: "pointer", color: "var(--text)", width: "100%", borderRadius: 6 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>Edit</button>
                                    )}
                                    <button type="button" onClick={() => { setMenuOpenId(null); deleteMessage(m.id); }} style={{ background: "none", border: "none", padding: "8px 12px", textAlign: "left", fontSize: 13, cursor: "pointer", color: "#ef4444", width: "100%", borderRadius: 6 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>Delete</button>
                                  </div>
                                )}
                              </div>
                              <div className={`chat-bubble ${isMe ? "sent" : "received"}`}>
                              
                              {activeChat.role === "client" && !isMe && (
                                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 4 }}>
                                  {senderTag}
                                </div>
                              )}

                              {(m.type === "text" || !m.type) ? (
                                <div style={{ wordBreak: "break-word", fontSize: 13.5 }}>{m.text}</div>
                              ) : null}

                              {/* Render photos */}
                              {m.type === "photo" && m.mediaData ? (
                                <div style={{ marginTop: 2, borderRadius: 8, overflow: "hidden", cursor: "zoom-in" }}>
                                  <img
                                    src={m.mediaData}
                                    alt="Shared Asset"
                                    style={{ maxWidth: "100%", maxHeight: 250, objectFit: "cover", borderRadius: 8, display: "block" }}
                                    onClick={() => {
                                      const w = window.open();
                                      w?.document.write(`<img src="${m.mediaData}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                    }}
                                  />
                                </div>
                              ) : null}

                              {/* Render document */}
                              {m.type === "document" && m.mediaData ? (
                                <div style={{ marginTop: 2, borderRadius: 8, padding: 12, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ fontSize: 24 }}>📄</div>
                                    <div style={{ flex: 1, overflow: "hidden" }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                                        {m.fileName || "Document File"}
                                      </div>
                                    </div>
                                    <a href={m.mediaData} download={m.fileName || "document"} style={{ textDecoration: "none", color: "#3b82f6", fontSize: 13, fontWeight: 700 }}>
                                      Download
                                    </a>
                                  </div>
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
                                  <div className="chat-bubble-footer" style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                                    <span>{formatTime(m.timestamp)}{m.editedAt ? " (edited)" : ""}</span>
                                    {isMe && (
                                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                              ) : (
                                <div className="chat-bubble-footer" style={{ marginTop: 6, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                                  <span>{formatTime(m.timestamp)}{m.editedAt ? " (edited)" : ""}</span>
                                  {isMe && (
                                    <span style={{ display: "flex", alignItems: "center", gap: 6 }} title={m.status === "read" && m.readTime ? `Read at ${new Date(m.readTime).toLocaleString()}` : m.status}>
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

              {/* Proxy Perspective Switcher */}
              {activeChat.role === "client" && (
                <div style={{ display: "flex", gap: 10, padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    🎭 Proxy Role perspective:
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${proxyRole === "admin" ? "btn-primary" : "btn-ghost"}`}
                      style={{ fontSize: 11, padding: "4px 10px", height: 26, borderRadius: 6 }}
                      onClick={() => setProxyRole("admin")}
                    >
                      👑 Admin (Manager)
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${proxyRole === "editor" ? "btn-primary" : "btn-ghost"}`}
                      style={{ fontSize: 11, padding: "4px 10px", height: 26, borderRadius: 6 }}
                      onClick={() => setProxyRole("editor")}
                    >
                      👥 Editor Proxy
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${proxyRole === "client" ? "btn-primary" : "btn-ghost"}`}
                      style={{ fontSize: 11, padding: "4px 10px", height: 26, borderRadius: 6 }}
                      onClick={() => setProxyRole("client")}
                    >
                      💼 Client Proxy
                    </button>
                  </div>
                </div>
              )}

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
                      <input
                        type="file"
                        ref={cameraInputRef}
                        style={{ display: "none" }}
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelect}
                      />
                      <input
                        type="file"
                        ref={docInputRef}
                        style={{ display: "none" }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                        onChange={handlePhotoSelect}
                      />
                      
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={sending}
                        title="Camera Capture"
                      >
                        📸
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                        title="Share Media File"
                      >
                        🖼️
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: 42, height: 42, borderRadius: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => docInputRef.current?.click()}
                        disabled={sending}
                        title="Attach Document"
                      >
                        📄
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
