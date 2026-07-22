"use client";

import { useId, useMemo, useState } from "react";
import { LtDatePicker } from "@/components/ui/LtDatePicker";
import { useMounted } from "@/lib/use-mounted";

type ComboProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
};

export function ComboField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
}: ComboProps) {
  const mounted = useMounted();
  const listId = useId();
  const unique = useMemo(
    () =>
      [...new Set(options.filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "lt"),
      ),
    [options],
  );

  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </span>
      <input
        className="field"
        list={mounted ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {mounted && (
        <datalist id={listId}>
          {unique.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  );
}

type SuggestProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
};

export function SuggestField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: SuggestProps) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = [...new Set(suggestions.filter(Boolean))];
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((s) => s.toLowerCase().includes(q))
      .sort((a, b) => {
        const al = a.toLowerCase();
        const bl = b.toLowerCase();
        const aStarts = al.startsWith(q) ? 0 : 1;
        const bStarts = bl.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return al.localeCompare(bl, "lt");
      })
      .slice(0, 8);
  }, [value, suggestions]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </span>
      <input
        className="field"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { LtDatePicker as DateField };
