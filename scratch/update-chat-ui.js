const fs = require('fs');

function processFile(filePath, isAdmin) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Add state for menu
  if (!content.includes('const [menuOpenId, setMenuOpenId] = useState')) {
    content = content.replace(
      'const [inputText, setInputText] = useState("");',
      'const [inputText, setInputText] = useState("");\n  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);'
    );
  }

  // Add handleEditClick
  if (!content.includes('const handleEditClick =')) {
    const handleEditCode = `
  const handleEditClick = (m: any) => {
    setEditingMessageId(m.id);
    setInputText(m.text || "");
    setMenuOpenId(null);
  };
`;
    content = content.replace('const sendMessage = async', handleEditCode + '\n  const sendMessage = async');
  }

  // Remove existing trash buttons
  const trashButtonRegex = /<button[^>]*onClick=\{\(\) => deleteMessage\(m\.id\)\}[^>]*>\s*🗑️\s*<\/button>/g;
  content = content.replace(trashButtonRegex, '');

  // Add the 3-dot context menu inside chat-message-bubble-wrapper
  const contextMenuCode = `
                            <div className={\`chat-message-bubble-wrapper \${isMe ? "sent" : "received"}\`} style={{ position: "relative" }} onContextMenu={(e) => { e.preventDefault(); setMenuOpenId(menuOpenId === m.id ? null : m.id); }}>
                              
                              <div style={{ position: "absolute", top: 4, [isMe ? 'right' : 'left']: isMe ? "100%" : "100%", padding: "0 8px", zIndex: 5 }}>
                                <button 
                                  onClick={() => setMenuOpenId(menuOpenId === m.id ? null : m.id)} 
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", height: 32, opacity: 0.6 }}
                                  title="Options"
                                >
                                  ⋮
                                </button>
                                {menuOpenId === m.id && (
                                  <div style={{ position: "absolute", top: "100%", [isMe ? 'right' : 'left']: 0, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 8, padding: 4, zIndex: 50, display: "flex", flexDirection: "column", gap: 4, minWidth: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
                                    {(isMe && (m.type === "text" || !m.type)) && (
                                      <button onClick={() => handleEditClick(m)} style={{ background: "none", border: "none", padding: "8px 12px", textAlign: "left", fontSize: 13, cursor: "pointer", color: "var(--text)", width: "100%", borderRadius: 6 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>Edit</button>
                                    )}
                                    {(${isAdmin ? 'true' : 'isMe'}) && (
                                      <button onClick={() => { setMenuOpenId(null); deleteMessage(m.id); }} style={{ background: "none", border: "none", padding: "8px 12px", textAlign: "left", fontSize: 13, cursor: "pointer", color: "#ef4444", width: "100%", borderRadius: 6 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>Delete</button>
                                    )}
                                  </div>
                                )}
                              </div>
`;

  content = content.replace(/<div className={`chat-message-bubble-wrapper \${isMe \? "sent" : "received"}`}>\s*<div className={`chat-bubble \${isMe \? "sent" : "received"}`}/g, 
    contextMenuCode + '                              <div className={`chat-bubble ${isMe ? "sent" : "received"}'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated ' + filePath);
}

processFile('src/app/admin/messages/page.tsx', true);
processFile('src/app/messages/page.tsx', false);
processFile('src/app/client/page.tsx', false);
