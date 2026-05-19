import Sidebar from "@/components/Sidebar";

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar role="editor" userName="Editor" />
      <main className="app-main">{children}</main>
    </div>
  );
}
