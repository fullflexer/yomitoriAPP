import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaseDetail } from "@/app/(dashboard)/_lib/cases";
import { buildCaseDiagramLayout } from "@/app/(dashboard)/_lib/diagram";
import { formatDateTime } from "@/app/(dashboard)/_lib/format";
import { GenerateDiagramButton } from "@/components/cases";
import { InheritanceDiagram } from "@/components/diagram/InheritanceDiagram";
import { buttonVariants } from "@/components/ui/button-classes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DiagramPageProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export default async function CaseDiagramPage({ params }: DiagramPageProps) {
  const { id } = await params;
  const caseRecord = await getCaseDetail(id);

  if (!caseRecord) {
    notFound();
  }

  const layout = caseRecord.persons.length > 0 ? await buildCaseDiagramLayout(caseRecord) : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm shadow-slate-200/60 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            Diagram
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{caseRecord.title}</h1>
          <p className="text-sm text-slate-600">
            更新: {formatDateTime(caseRecord.updatedAt)} / 人物 {caseRecord.persons.length} 件
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <GenerateDiagramButton caseId={id} />
          <Link
            href={`/cases/${id}/diagram/download`}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            PDF をダウンロード
          </Link>
        </div>
      </section>

      {layout ? (
        <InheritanceDiagram layout={layout} title={`${caseRecord.title} 相続関係図`} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>図面を生成できません</CardTitle>
            <CardDescription>
              相続図を描画するには、最低 1 件の人物データが必要です。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            先に文書アップロードと OCR 処理を実行してください。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
