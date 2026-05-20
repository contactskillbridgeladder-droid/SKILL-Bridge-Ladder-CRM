"use client";
import { useEffect, useState } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminSettings() {
  const [inviteLink] = useState("https://crm.skillbridgeladder.in/login?invite=SKILLBRIDGE2026");
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string; name: string } | null>(null);
  
  // Test Notification Form States
  const [notifType, setNotifType] = useState("general");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [notifTitle, setNotifTitle] = useState("Test System Alert");
  const [notifMessage, setNotifMessage] = useState("This is a live test notification generated from the Admin Settings dashboard.");
  
  // Extra template details
  const [taskTitle, setTaskTitle] = useState("Pro Shorts Edit");
  const [channelName, setChannelName] = useState("Ladder Main Channel");
  const [taskPay, setTaskPay] = useState(1500);
  const [paymentAmount, setPaymentAmount] = useState(4500);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsub = onAuthStateChanged(auth, async (u) => {
        if (u) {
          const snap = await getDoc(doc(db, "users", u.uid));
          const userData = snap.exists() ? snap.data() : {};
          const userDetails = {
            uid: u.uid,
            email: u.email || "",
            name: userData.name || u.email || "Administrator"
          };
          setCurrentUser(userDetails);
          setRecipientEmail(userDetails.email);
          setRecipientName(userDetails.name);
        }
      });
    });
    return () => unsub?.();
  }, []);

  const handleSendTestNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setTesting(true);
    setTestResult(null);

    const payload: Record<string, any> = {
      toUid: currentUser.uid,
      toEmail: recipientEmail,
      toName: recipientName,
      title: notifTitle,
      message: notifMessage,
      type: notifType,
      subject: notifTitle,
    };

    if (notifType === "task_assigned") {
      payload.taskTitle = taskTitle;
      payload.channel = channelName;
      payload.taskType = "Main Edit";
      payload.due = new Date(Date.now() + 86400000 * 2).toLocaleDateString(); // 2 days from now
      payload.pay = Number(taskPay);
    } else if (notifType === "payment_released") {
      payload.amount = Number(paymentAmount);
      payload.taskTitle = taskTitle;
    }

    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, msg: "Test notification sent successfully! Check your email and notification tray." });
      } else {
        setTestResult({ success: false, msg: data.error || "Failed to trigger test notification." });
      }
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message || "An unexpected network error occurred." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:28}}>
      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">CRM configuration, notification testing, and access management.</p>
        </div>
      </div>

      {/* Invite */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Invite Team Members</div>
          <div style={{fontSize:13,color:"var(--text-muted)"}}>Generate temporary, unique invitation links with customizable expiry times.</div>
        </div>
        <div>
          <a href="/admin/team" className="btn btn-primary" style={{display:"inline-block",textDecoration:"none"}}>
            Go to Team Management to Generate Link
          </a>
        </div>
      </div>

      {/* Interactive Notification Tester */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Live Notification Tester</div>
          <div style={{fontSize:13,color:"var(--text-muted)"}}>Trigger a real-time system notification. This fires an in-app tray alert, pushes an FCM browser pop-up (if enabled), and sends a verified Resend template email.</div>
        </div>

        {testResult && (
          <div style={{
            background: testResult.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: testResult.success ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
            color: testResult.success ? "#34d399" : "#f87171",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 13,
            marginBottom: 20
          }}>
            {testResult.success ? "✅" : "❌"} {testResult.msg}
          </div>
        )}

        <form onSubmit={handleSendTestNotification} style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div className="form-group">
              <label className="form-label">Notification Type</label>
              <select className="crm-input" value={notifType} onChange={e => setNotifType(e.target.value)}>
                <option value="general">General / Text Template</option>
                <option value="task_assigned">Task Assigned Template</option>
                <option value="payment_released">Payment Released Template</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Recipient Email</label>
              <input type="email" required className="crm-input" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="Email to notify" />
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div className="form-group">
              <label className="form-label">Notification Title</label>
              <input type="text" required className="crm-input" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Recipient Name</label>
              <input type="text" required className="crm-input" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
            </div>
          </div>

          {/* Dynamic Template Fields */}
          {notifType === "task_assigned" && (
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12
            }}>
              <div className="form-group">
                <label className="form-label" style={{fontSize:11}}>Mock Task Title</label>
                <input type="text" className="crm-input" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{fontSize:11}}>Mock Channel</label>
                <input type="text" className="crm-input" value={channelName} onChange={e => setChannelName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{fontSize:11}}>Mock Pay (₹)</label>
                <input type="number" className="crm-input" value={taskPay} onChange={e => setTaskPay(Number(e.target.value))} />
              </div>
            </div>
          )}

          {notifType === "payment_released" && (
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12
            }}>
              <div className="form-group">
                <label className="form-label" style={{fontSize:11}}>Associated Task</label>
                <input type="text" className="crm-input" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{fontSize:11}}>Payout Amount (₹)</label>
                <input type="number" className="crm-input" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Message Details</label>
            <textarea className="crm-input" rows={3} value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Type details here..." />
          </div>

          <button type="submit" disabled={testing || !currentUser} className="btn btn-primary" style={{alignSelf:"flex-start", padding:"10px 24px"}}>
            {testing ? "Firing Test Notification..." : "🚀 Trigger Test Notification"}
          </button>
        </form>
      </div>

      {/* Email / Notification */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Email & Notifications Settings</div>
          <div style={{fontSize:13,color:"var(--text-muted)"}}>Emails are sent from <strong style={{color:"var(--accent-light)"}}>notifications@skillbridgeladder.in</strong> via Resend through your Cloudflare Worker.</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[
            {label:"Task Assigned", desc:"Notify editor when a task is assigned to them"},
            {label:"Review Feedback", desc:"Notify editor/head when corrections are added"},
            {label:"Payment Released", desc:"Notify editor when payment is marked as paid"},
            {label:"Task Approved", desc:"Notify head editor when admin approves their task"},
          ].map(item=>(
            <div key={item.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{item.label}</div>
                <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{item.desc}</div>
              </div>
              <label style={{position:"relative",display:"inline-flex",cursor:"pointer"}}>
                <input type="checkbox" defaultChecked style={{opacity:0,width:0,height:0}} />
                <span style={{display:"block",width:40,height:22,background:"var(--accent)",borderRadius:99,transition:"background 0.2s"}} />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Domain */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:16,fontWeight:700,fontSize:15}}>Domain & Deployment</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {[
            {label:"CRM Hub",value:"crm.skillbridgeladder.in",status:"✅ Live"},
            {label:"Auth Domain",value:"auth.crm.skillbridgeladder.in",status:"✅ Live"},
            {label:"Cloudflare Worker",value:"skillbridge-crm-env.contact-skillbridgeladder.workers.dev",status:"✅ Live"},
            {label:"Email Sender",value:"notifications@skillbridgeladder.in",status:"✅ Verified"},
          ].map(item=>(
            <div key={item.label} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)",fontFamily:"monospace",marginBottom:6}}>{item.value}</div>
              <span className={`badge ${item.status.startsWith("✅")?"badge-green":"badge-amber"}`}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
