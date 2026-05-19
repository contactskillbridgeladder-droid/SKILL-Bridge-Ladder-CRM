"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; uid: string } | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) {
          router.push("/login");
          return;
        }
        if (!db) {
          console.error("Firestore DB not initialized in notifications layout.");
          return;
        }
        getDoc(doc(db, "users", u.uid)).then((snap: any) => {
          const d = snap.data();
          setUser({ name: d?.name || u.email || "", role: d?.role || "editor", uid: u.uid });
        });
      });
    });
    return () => unsub?.();
  }, [router]);

  if (!user) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <div style={{ color:"var(--text-muted)", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <div className="app-shell">
      <Sidebar role={user.role} userName={user.name} uid={user.uid} />
      <main className="app-main">{children}</main>
    </div>
  );
}
