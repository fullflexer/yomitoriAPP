import Link from "next/link";

import { getCaseList } from "@/app/(dashboard)/_lib/cases";
import { CaseList } from "@/components/cases";
import { buttonVariants } from "@/components/ui/button-classes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function CasesPage() {
  const cases = await getCaseList();

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm shadow-slate-200/60 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            Dashboard
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">案件一覧</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            OCR 処理済みの文書、人物、相続関係図を案件ごとに確認できます。
          </p>
        </div>

        <Link
          href="/cases/new"
          className={cn(buttonVariants({ variant: "default" }))}
        >
          案件を作成
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <CaseList cases={cases} />

        <Card>
          <CardHeader>
            <CardTitle>運用メモ</CardTitle>
            <CardDescription>この画面で確認する主なポイント</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
            <p>・アップロード済み文書の OCR 完了状況</p>
            <p>・人物抽出と名寄せの進行状況</p>
            <p>・相続図面のダウンロード可否</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
