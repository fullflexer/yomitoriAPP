import Link from "next/link";

import type { CaseListItem } from "@/app/(dashboard)/_lib/cases";
import { formatDateTime } from "@/app/(dashboard)/_lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-classes";
import { cn } from "@/lib/utils";

import { CaseStatus } from "./CaseStatus";

export interface CaseListProps {
  cases: CaseListItem[];
}

export function CaseList({ cases }: CaseListProps) {
  if (cases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>案件がまだありません</CardTitle>
          <CardDescription>右上の作成ボタンから最初の案件を追加します。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {cases.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatus status={entry.status} />
                <CaseStatus status={entry.matchingStatus} kind="matching" />
              </div>
              <div className="space-y-1">
                <Link
                  href={`/cases/${entry.id}`}
                  className="text-lg font-semibold tracking-tight text-slate-900 transition hover:text-slate-700"
                >
                  {entry.title}
                </Link>
                <p className="text-sm text-slate-500">
                  更新: {formatDateTime(entry.updatedAt)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">文書 {entry.counts.documents}</Badge>
              <Badge variant="outline">人物 {entry.counts.persons}</Badge>
              <Badge variant="outline">相続人 {entry.counts.heirs}</Badge>
              <Link
                href={`/cases/${entry.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                詳細
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
