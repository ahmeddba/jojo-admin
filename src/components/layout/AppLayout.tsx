import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-6 bg-jojo-bg overflow-y-auto">
        {children}
        <Footer />
      </main>
    </div>
  );
}
