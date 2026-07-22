"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MobileCardList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-stone-100 md:hidden">{children}</div>;
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
        <p className="font-semibold text-stone-900">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-stone-500">{subtitle}</p>
        )}
        {meta && <div className="mt-2 text-sm text-stone-700">{meta}</div>}
      </div>
      {actions && <div className="flex w-full flex-col gap-2 sm:w-auto">{actions}</div>}
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

