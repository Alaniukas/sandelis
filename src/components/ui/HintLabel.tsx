"use client";

import { useId, useState } from "react";

type Props = {
  label: string;
  hint?: string;
  className?: string;
  block?: boolean;
};

export function HintLabel({ label, hint, className, block }: Props) {
  const [show, setShow] = useState(false);
  const hintId = useId();

  if (!hint) {
    return (
      <span className={`text-sm font-medium text-stone-700 ${className ?? ""}`}>
        {label}
      </span>
    );
  }

  return (
    <span
      className={`${block ? "flex" : "inline-flex"} items-center gap-1.5 ${className ?? ""}`}
    >
      <span
        className={
          block
            ? "font-display text-3xl font-semibold md:text-4xl text-stone-900"
            : "text-sm font-medium text-stone-700"
        }
      >
        {label}
      </span>
      <span className="relative inline-flex">
        <button
          type="button"
          aria-describedby={show ? hintId : undefined}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-[10px] font-bold leading-none text-stone-500 transition hover:border-stone-400 hover:bg-white hover:text-stone-800"
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          onFocus={() => setShow(true)}
          onBlur={() => setShow(false)}
          aria-label="Daugiau informacijos"
        >
          ?
        </button>
        {show && (
          <span
            id={hintId}
            role="tooltip"
            className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-stone-200 bg-stone-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg"
          >
            {hint}
          </span>
        )}
      </span>
    </span>
  );
}
