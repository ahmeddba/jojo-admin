"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-jojo-bg">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-auto rounded-full mb-4">
        <Image
          src="/logo.png"
          alt="La Storia di JOJO"
          width={60}
          height={60}
          className="size-26 w-auto object-contain"
          priority
        />
          </div>
          <h1 className="font-display text-3xl font-bold text-jojo-text">
            La Storia di JOJO
          </h1>
          <p className="text-sm text-jojo-text-secondary mt-1">
            Admin Panel – Sign in to continue
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-jojo border border-jojo-border/40 p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-jojo-text-secondary mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-jojo-border bg-jojo-surface-light text-sm focus:outline-none focus:ring-2 focus:ring-jojo-green focus:border-jojo-green transition"
                placeholder="admin@jojo.tn"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-jojo-text-secondary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-jojo-border bg-jojo-surface-light text-sm focus:outline-none focus:ring-2 focus:ring-jojo-green focus:border-jojo-green transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-jojo-green text-white font-semibold text-sm hover:bg-jojo-green-dark transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-jojo-text-secondary mt-6">
          © {new Date().getFullYear()} La Storia di JOJO. All rights reserved.
        </p>
      </div>
    </div>
  );
}
