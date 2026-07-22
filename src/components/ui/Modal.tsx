"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Uždaryti"
        className="absolute inset-0 bg-stone-900/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-stone-300 sm:hidden" />
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="font-display text-base font-semibold text-stone-900 sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-800 sm:min-h-0 sm:py-1"
          >
            Uždaryti
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-2 sm:px-5">
          {children}
        </div>
      </div>
    </div>
  );
}
