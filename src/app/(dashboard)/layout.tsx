import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button-classes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "yomitoriAPP",
  description: "Inheritance dashboard for case review and document processing."
};

const navItems = [
  { href: "/cases", label: "案件一覧" },
  { href: "/cases/new", label: "案件作成" }
];

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <Link href="/cases" className="text-lg font-semibold tracking-tight text-slate-900">
              yomitoriAPP
            </Link>
            <p className="text-xs text-slate-500">
              案件一覧・文書アップロード・相続図面を一箇所で管理します。
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
