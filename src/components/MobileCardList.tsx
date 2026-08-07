"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MobileCardList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:hidden">
      {children}
    </div>
  );
}

export function MobileCardRow({
  title,
  subtitle,
  meta,
  actions,
  href,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug text-stone-900">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-stone-500">{subtitle}</p>
        )}
        {meta && <div className="mt-2 text-sm text-stone-600">{meta}</div>}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      )}
    </>
  );

  const className =
    "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start active:bg-stone-50 touch-manipulation";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
