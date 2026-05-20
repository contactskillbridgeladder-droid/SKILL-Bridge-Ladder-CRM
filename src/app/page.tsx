"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsub = onAuthStateChanged(auth, (u) => {
        if (u) {
          if (u.emailVerified) {
            getDoc(doc(db, "users", u.uid)).then((snap: any) => {
              const role = snap.exists() ? snap.data().role : "editor";
              if (role === "admin") router.push("/admin");
              else if (role === "head_editor") router.push("/head-editor");
              else router.push("/editor");
            }).catch(() => {
              router.push("/login");
            });
          } else {
            router.push("/login");
          }
        } else {
          router.push("/login");
        }
      });
    }).catch(() => {
      router.push("/login");
    });
    return () => unsub?.();
  }, [router]);

  return (
    <div className="startup-loader-container">
      <div className="loader-logo-wrapper">
        <div className="loader-glow-ring"></div>
        <div className="loader-glow-ring-inner"></div>
        <img src="/logo.png" alt="SkillBridge CRM" className="loader-logo" />
      </div>
      <h1 className="loader-brand gradient-text">SkillBridge CRM</h1>
      <p className="loader-status">Directing to workspace...</p>
      <div className="loader-progress-track">
        <div className="loader-progress-bar"></div>
      </div>
    </div>
  );
}
