"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Boxes,
  BookOpen,
  Tag,
  Receipt,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/stock", label: "Inventory", icon: Boxes },
    { href: "/menu", label: "Menu Mgmt", icon: BookOpen },
    { href: "/best-deals", label: "Promotions", icon: Tag },
    { href: "/caisse", label: "Financials", icon: Receipt },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-white/50 dark:bg-black/20 flex flex-col p-4 backdrop-blur-sm border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <Image
          src="/logo.png"
          alt="La Storia di JOJO"
          width={60}
          height={60}
          className="size-24 w-auto object-contain"
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                active
                  ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-antique-gold font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 dark:hover:text-antique-gold"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="mt-auto flex flex-col gap-2">
        <Link
          href="#"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
        >
          <Settings className="h-5 w-5" />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors w-full text-left"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </aside>
  );
};
