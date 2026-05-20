"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
          console.error("Firestore DB not initialized in admin layout.");
          return;
        }
        getDoc(doc(db, "users", u.uid)).then((snap: any) => {
          const d = snap.data();
          if (d?.isBanned === true) {
            signOut(auth).then(() => {
              router.push("/login?error=banned");
            });
            return;
          }

          // Verify session
          const sessionId = localStorage.getItem("currentSessionId");
          if (!sessionId) {
            const newSessId = "sess_" + Math.random().toString(36).substring(2, 12);
            localStorage.setItem("currentSessionId", newSessId);
            const { setDoc } = require("firebase/firestore");
            setDoc(doc(db, "users", u.uid, "sessions", newSessId), {
              id: newSessId,
              userAgent: navigator.userAgent,
              loginTime: new Date(),
              lastActive: new Date(),
              status: "active"
            }).catch(console.error);
          } else {
            getDoc(doc(db, "users", u.uid, "sessions", sessionId)).then((sessSnap: any) => {
              if (!sessSnap.exists() || sessSnap.data().status !== "active") {
                signOut(auth).then(() => {
                  router.push("/login?error=session_terminated");
                });
              } else {
                const { updateDoc } = require("firebase/firestore");
                updateDoc(doc(db, "users", u.uid, "sessions", sessionId), {
                  lastActive: new Date()
                }).catch(console.error);
              }
            }).catch(() => {
              signOut(auth).then(() => {
                router.push("/login?error=session_terminated");
              });
            });
          }

          const role = d?.role || "editor";
          if (role !== "admin") {
            router.push(role === "head_editor" ? "/head-editor" : "/editor");
            return;
          }
          setUser({ name: d?.name || u.email || "", role, uid: u.uid });
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
