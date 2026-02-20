import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-y-auto bg-jojo-bg">
        <div className="flex-1 w-full px-8 py-6">
          {children}
        </div>
        <div className="px-8 pb-6">
          <Footer />
        </div>
      </main>
    </div>
  );
}
