"use client";
import { useState } from "react";

export default function AdminSettings() {
  const [inviteLink] = useState("https://crm.skillbridgeladder.in/login?invite=SKILLBRIDGE2026");
  const [copied, setCopied] = useState(false);

  const copy = () => { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:28}}>
      <div className="page-header animate-fade">
        <div><h1 className="page-title">Settings</h1><p className="page-subtitle">CRM configuration and access management.</p></div>
      </div>

      {/* Invite */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Invite Team Members</div>
          <div style={{fontSize:13,color:"var(--text-muted)"}}>Share this link with editors or head editors. New accounts default to the Editor role.</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <input className="crm-input" readOnly value={inviteLink} style={{flex:1}} />
          <button className="btn btn-primary" onClick={copy}>{copied?"✅ Copied!":"Copy Link"}</button>
        </div>
      </div>

      {/* Email / Notification */}
      <div className="section-card animate-fade" style={{padding:28}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Email & Notifications</div>
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
            {label:"CRM Hub",value:"crm.skillbridgeladder.in",status:"Pending DNS"},
            {label:"Auth Domain",value:"auth.crm.skillbridgeladder.in",status:"Pending DNS"},
            {label:"Cloudflare Worker",value:"skillbridge-crm-env.contact-skillbridgeladder.workers.dev",status:"✅ Live"},
            {label:"Email Sender",value:"notifications@skillbridgeladder.in",status:"Pending Verify"},
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
