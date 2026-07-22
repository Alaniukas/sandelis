"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMounted } from "@/lib/use-mounted";

const MONTHS_LT = [
  "Sausis",
  "Vasaris",
  "Kovas",
  "Balandis",
  "Gegužė",
  "Birželis",
  "Liepa",
  "Rugpjūtis",
  "Rugsėjis",
  "Spalis",
  "Lapkritis",
  "Gruodis",
] as const;

const WEEKDAYS_LT = ["Pr", "An", "Tr", "Kt", "Pn", "Še", "Se"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

/** Kompaktas formatas lauke — neperlaužia siaurame stulpelyje */
function formatDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return "";
  return `${pad(p.d)}.${pad(p.m + 1)}.${p.y}`;
}

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  clearable?: boolean;
};

export function LtDatePicker({
  label,
  value,
  onChange,
  className,
  clearable = true,
}: Props) {
  const mounted = useMounted();
  const today = new Date();
  const initial = parseIso(value) ?? {
    y: today.getFullYear(),
    m: today.getMonth(),
    d: today.getDate(),
  };

  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(initial.y);
  const [viewM, setViewM] = useState(initial.m);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = parseIso(value);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(viewY, viewM, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const prevDays = new Date(viewY, viewM, 0).getDate();
    const out: {
      d: number;
      m: number;
      y: number;
      muted: boolean;
    }[] = [];

    for (let i = startPad - 1; i >= 0; i--) {
      const d = prevDays - i;
      const m = viewM === 0 ? 11 : viewM - 1;
      const y = viewM === 0 ? viewY - 1 : viewY;
      out.push({ d, m, y, muted: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ d, m: viewM, y: viewY, muted: false });
    }
    while (out.length % 7 !== 0 || out.length < 42) {
      const idx = out.length - (startPad + daysInMonth);
      const d = idx + 1;
      const m = viewM === 11 ? 0 : viewM + 1;
      const y = viewM === 11 ? viewY + 1 : viewY;
      out.push({ d, m, y, muted: true });
    }
    return out.slice(0, 42);
  }, [viewY, viewM]);

  function prevMonth() {
    if (viewM === 0) {
      setViewM(11);
      setViewY((y) => y - 1);
    } else setViewM((m) => m - 1);
  }

  function nextMonth() {
    if (viewM === 11) {
      setViewM(0);
      setViewY((y) => y + 1);
    } else setViewM((m) => m + 1);
  }

  function pick(y: number, m: number, d: number) {
    onChange(toIso(y, m, d));
    setOpen(false);
  }

  const selected = parseIso(value);
  const todayIso = toIso(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </span>
      {!mounted ? (
        <div className="field flex items-center text-stone-400">
          {value ? formatDisplay(value) : "Visos datos"}
        </div>
      ) : (
        <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`field date-field-btn flex w-full items-center justify-between gap-2 text-left ${
            clearable && value ? "pr-9" : ""
          }`}
        >
          <span
            className={`min-w-0 truncate whitespace-nowrap ${
              value ? "text-stone-900" : "text-stone-400"
            }`}
          >
            {value ? formatDisplay(value) : "Visos datos"}
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-stone-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
        {clearable && value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-base leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-800"
            aria-label="Anuliuoti datą"
            title="Anuliuoti — ieškoti visų datų"
          >
            ×
          </button>
        )}
      </div>

      {clearable && value && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-stone-500 underline hover:text-stone-800"
          onClick={() => onChange("")}
        >
          Anuliuoti datą
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-[min(100%,18rem)] rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100"
              aria-label="Ankstesnis mėnuo"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-stone-900">
              {MONTHS_LT[viewM]} {viewY}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100"
              aria-label="Kitas mėnuo"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold text-stone-500">
            {WEEKDAYS_LT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => {
              const iso = toIso(c.y, c.m, c.d);
              const isSel =
                selected?.y === c.y &&
                selected?.m === c.m &&
                selected?.d === c.d;
              const isToday = iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(c.y, c.m, c.d)}
                  className={`aspect-square rounded-lg text-sm transition ${
                    isSel
                      ? "bg-stone-900 font-semibold text-white"
                      : isToday
                        ? "bg-stone-100 font-medium text-stone-900"
                        : c.muted
                          ? "text-stone-300 hover:bg-stone-50"
                          : "text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  {c.d}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-between gap-2 border-t border-stone-100 pt-2">
            <button
              type="button"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Išvalyti
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-stone-900 hover:underline"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
            >
              Šiandien
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
