const fs = require('fs');
let file = 'src/app/messages/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {activeChat.role === "client" ? \`Client Channel: \${activeChat.name || activeChat.email}\` : (activeChat.name || activeChat.email)}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize" }}>`;

const replacement = `                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {activeChat.role === "client" ? \`Client Channel: \${activeChat.name || activeChat.email}\` : (activeChat.name || activeChat.email)}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Done");
