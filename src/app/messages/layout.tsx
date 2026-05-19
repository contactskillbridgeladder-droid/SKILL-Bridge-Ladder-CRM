"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initFirebase } from "@/lib/firebase";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; uid: string } | null>(null);

  useEffect(() => {
    initFirebase().then(({ auth, db }) => {
      const u = auth.currentUser;
      if (!u) { router.push("/login"); return; }
      const { doc, getDoc } = require("firebase/firestore");
      getDoc(doc(db, "users", u.uid)).then((snap: any) => {
        const d = snap.data();
        setUser({ name: d?.name || u.email || "", role: d?.role || "editor", uid: u.uid });
      });
    });
  }, [router]);

  if (!user) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <div style={{ color:"var(--text-muted)", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <div className="app-shell">
      <Sidebar role={user.role} userName={user.name} uid={user.uid} />
      <main className="app-main" style={{ padding: 0, height: "100vh", overflow: "hidden" }}>{children}</main>
    </div>
  );
}
