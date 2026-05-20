/**
 * Central Firestore data layer — all collection helpers in one place
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, setDoc, Timestamp
} from "firebase/firestore";
import { initFirebase } from "./firebase";

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getDb() {
  const { db } = await initFirebase();
  return db;
}

// ── TASKS ─────────────────────────────────────────────────────────────────────
export type TaskStatus = "Open" | "Pending" | "In Progress" | "In Review" | "Approved" | "Rejected";
export type TaskType = "Main Edit" | "Shorts";

export interface Task {
  id?: string;
  taskNumber?: string;  // e.g. "SBL-001", "SBL-002"
  title: string;
  channel: string;
  channelId: string;
  type: TaskType;
  editorUid: string | null;
  editorName: string;
  headEditorUid: string | null;
  status: TaskStatus;
  adminPrice: number;   // total charged to client
  editorPay: number;    // editor's share
  headPay: number;      // head editor's commission
  adminEarning: number; // admin net (adminPrice - editorPay - headPay)
  submissionLink: string;
  youtubeUrl: string;
  notes: string;
  due: string;
  zohoLogged: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export async function getTasks(): Promise<Task[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "tasks"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
}

export async function getTasksByEditor(editorUid: string): Promise<Task[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "tasks"), where("editorUid", "==", editorUid), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
}

export async function getTasksByHeadEditor(headUid: string): Promise<Task[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "tasks"), where("headEditorUid", "==", headUid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
}

/** Generate next task number like SBL-001, SBL-002, etc. */
async function getNextTaskNumber(): Promise<string> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "tasks"), orderBy("createdAt", "desc")));
  let maxNum = 0;
  snap.docs.forEach(d => {
    const tn = d.data().taskNumber as string;
    if (tn) {
      const n = parseInt(tn.replace("SBL-", ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `SBL-${String(maxNum + 1).padStart(3, "0")}`;
}

export async function createTask(data: Omit<Task, "id">): Promise<string> {
  const db = await getDb();
  const taskNumber = await getNextTaskNumber();
  const ref = await addDoc(collection(db, "tasks"), { ...data, taskNumber, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateTask(id: string, data: Partial<Task>): Promise<void> {
  const db = await getDb();
  await updateDoc(doc(db, "tasks", id), { ...data, updatedAt: serverTimestamp() });
}

// ── USERS ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: "admin" | "head_editor" | "editor";
  sourced_by?: string;
  whatsappNumber?: string;
  createdAt?: any;
  isBanned?: boolean;
}

export async function getUsers(): Promise<UserProfile[]> {
  const db = await getDb();
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => d.data() as UserProfile);
}

export async function getUsersByRole(role: string): Promise<UserProfile[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", role)));
  return snap.docs.map(d => d.data() as UserProfile);
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const { auth } = await initFirebase();
  const user = auth.currentUser;
  if (!user) return null;
  const db = await getDb();
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

// ── CHANNELS ──────────────────────────────────────────────────────────────────
export interface Channel {
  id?: string;
  name: string;
  handle: string;
  niche: string;
  type: string;
  active: boolean;
  youtubeUrl?: string;
  avatarUrl?: string;
  subscriberCount?: string;
  createdAt?: any;
}

export async function getChannels(): Promise<Channel[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "channels"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Channel));
}

export async function createChannel(data: Omit<Channel, "id">): Promise<string> {
  const db = await getDb();
  const ref = await addDoc(collection(db, "channels"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<void> {
  const db = await getDb();
  await updateDoc(doc(db, "channels", id), data);
}

export async function deleteChannel(id: string): Promise<void> {
  const db = await getDb();
  await deleteDoc(doc(db, "channels", id));
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
export interface Payment {
  id?: string;
  taskId: string;
  taskTitle: string;
  toUid: string;
  toName: string;
  toEmail: string;
  role: "editor" | "head_editor";
  amount: number;
  status: "Pending" | "Paid";
  zohoLogged: boolean;
  paidAt?: any;
  createdAt?: any;
}

export async function getPayments(): Promise<Payment[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
}

export async function getPaymentsByUser(uid: string): Promise<Payment[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "payments"), where("toUid", "==", uid), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
}

export async function markPaymentPaid(id: string): Promise<void> {
  const db = await getDb();
  await updateDoc(doc(db, "payments", id), { status: "Paid", paidAt: serverTimestamp() });
}

export async function markZohoLogged(id: string): Promise<void> {
  const db = await getDb();
  await updateDoc(doc(db, "payments", id), { zohoLogged: true });
}

// ── NOTIFICATIONS (client-side read) ──────────────────────────────────────────
export function subscribeNotifications(uid: string, cb: (notifs: any[]) => void) {
  let unsub: () => void;
  getDb().then(db => {
    const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
    unsub = onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
  return () => unsub?.();
}

// ── REAL-TIME TASK STREAM ──────────────────────────────────────────────────────
export function subscribeAllTasks(cb: (tasks: Task[]) => void) {
  let unsub: () => void;
  getDb().then(db => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    unsub = onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task))));
  });
  return () => unsub?.();
}

export function subscribeEditorTasks(editorUid: string, cb: (tasks: Task[]) => void) {
  let unsub: () => void;
  getDb().then(db => {
    const q = query(collection(db, "tasks"), where("editorUid", "==", editorUid));
    unsub = onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task))));
  });
  return () => unsub?.();
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  const db = await getDb();
  await updateDoc(doc(db, "users", uid), data);
}

// ── AUDIT LOGS ──────────────────────────────────────────────────────────────
export interface AuditLog {
  id?: string;
  action: string;
  details: string;
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  createdAt?: any;
}

export async function logActivity(
  action: string,
  details: string,
  user: { uid: string; name: string; email: string }
): Promise<void> {
  try {
    const db = await getDb();
    await addDoc(collection(db, "audit_logs"), {
      action,
      details,
      performedByUid: user.uid,
      performedByName: user.name || "Unknown",
      performedByEmail: user.email,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}

// ── AI ANALYSIS LOGS ─────────────────────────────────────────────────────────
export interface AIAnalysisLog {
  id?: string;
  url: string;
  title: string;
  suggestionsCount: number;
  performedByUid: string;
  performedByEmail: string;
  createdAt?: any;
}

export async function logAIAnalysis(
  url: string,
  title: string,
  suggestionsCount: number,
  user: { uid: string; email: string }
): Promise<void> {
  try {
    const db = await getDb();
    await addDoc(collection(db, "ai_analysis_logs"), {
      url,
      title,
      suggestionsCount,
      performedByUid: user.uid,
      performedByEmail: user.email,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to log AI analysis:", err);
  }
}

export async function getAIAnalysisLogs(): Promise<AIAnalysisLog[]> {
  const db = await getDb();
  const snap = await getDocs(query(collection(db, "ai_analysis_logs"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AIAnalysisLog));
}


