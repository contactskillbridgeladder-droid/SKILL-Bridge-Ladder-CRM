"use client";
const myTeam = [
  { id:"U-001", name:"Arjun Kumar", email:"arjun@skillbridge.in", tasks:5, earned:"₹12,500", active: true },
  { id:"U-003", name:"Suresh Patel", email:"suresh@skillbridge.in", tasks:3, earned:"₹7,200", active: true },
  { id:"U-005", name:"Rohan Das", email:"rohan@skillbridge.in", tasks:2, earned:"₹4,800", active: false },
];
const myTasks = [
  { id:"T-001", title:"Tech Channel S2E04", type:"Main Edit", editor:"Arjun K.", status:"In Review", commission:"₹500" },
  { id:"T-005", title:"Finance S1E12", type:"Main Edit", editor:"Arjun K.", status:"In Progress", commission:"₹560" },
  { id:"T-008", title:"Shorts Pack – May Ep2", type:"Shorts", editor:"Suresh P.", status:"In Progress", commission:"₹300" },
];

export default function HeadEditorDashboard() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:28}}>
      <div className="page-header animate-fade">
        <div><h1 className="page-title">Head Editor Dashboard</h1><p className="page-subtitle">Supervise your team and track your commission.</p></div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:16}} className="animate-fade">
        {[
          {label:"My Editors",value:"3",icon:"👥",color:"icon-blue"},
          {label:"Active Tasks",value:"3",icon:"📋",color:"icon-purple"},
          {label:"My Commission",value:"₹1,360",icon:"💰",color:"icon-green"},
          {label:"Pending Review",value:"1",icon:"⏳",color:"icon-amber"},
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div className="section-card animate-fade">
          <div className="section-header"><div className="section-title">Tasks Under Supervision</div></div>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>ID</th><th>Task</th><th>Type</th><th>Editor</th><th>Status</th><th>My Commission</th></tr></thead>
              <tbody>
                {myTasks.map(t=>(
                  <tr key={t.id}>
                    <td><span className="cell-mono">{t.id}</span></td>
                    <td><span className="cell-strong" style={{fontSize:13}}>{t.title}</span></td>
                    <td><span className={`badge ${t.type==="Shorts"?"badge-blue":"badge-purple"}`}>{t.type}</span></td>
                    <td>{t.editor}</td>
                    <td><span className="badge badge-amber">{t.status}</span></td>
                    <td><span style={{fontWeight:600,color:"var(--green)"}}>{t.commission}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-card animate-fade">
          <div className="section-header"><div className="section-title">My Editors</div></div>
          <div style={{padding:"8px 0"}}>
            {myTeam.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 20px",borderBottom:"1px solid var(--border)"}}>
                <div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#7c3aed,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"white",fontSize:14,flexShrink:0}}>{m.name[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:"var(--text)"}}>{m.name}</div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>{m.tasks} tasks · {m.earned}</div>
                </div>
                <span className={`badge ${m.active?"badge-green":"badge-red"}`}>{m.active?"Active":"Inactive"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
