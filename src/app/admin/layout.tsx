import Sidebar from "@/components/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar role="admin" userName="Veer" />
      <main className="app-main">{children}</main>
    </div>
  );
}
