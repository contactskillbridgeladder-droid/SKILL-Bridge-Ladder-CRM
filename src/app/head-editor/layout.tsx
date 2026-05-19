import Sidebar from "@/components/Sidebar";

export default function HeadEditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar role="head_editor" userName="Head Editor" />
      <main className="app-main">{children}</main>
    </div>
  );
}
