"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const errorParam = params.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const configured = isSupabaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError("Neteisingas vartotojo vardas arba slaptažodis.");
        setLoading(false);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError("Serverio klaida — bandyk vėliau.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col justify-center px-2 py-8">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-sm font-bold text-white">
            W
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold">Sandėlio WMS</h1>
            <p className="text-sm text-stone-500">Tik komandos nariams</p>
          </div>
        </div>

        {!configured && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Supabase nesukonfigūruotas — patikrink env Vercel projekte.
          </p>
        )}

        {(errorParam === "auth" || errorParam === "config") && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorParam === "config"
              ? "Serverio konfigūracijos klaida."
              : "Prisijungimas nepavyko — bandyk dar kartą."}
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Vartotojo vardas
            </span>
            <input
              type="text"
              autoComplete="username"
              required
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Komandos vartotojo vardas"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Slaptažodis
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary w-full !py-3"
            disabled={loading || !configured}
          >
            {loading ? "Jungiama…" : "Prisijungti"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-stone-500">Kraunama…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
