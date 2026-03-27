import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaseDetail } from "@/app/(dashboard)/_lib/cases";
import { formatCurrency, formatDate, formatDateTime } from "@/app/(dashboard)/_lib/format";
import { CaseStatus, PersonList, RunInheritanceButton } from "@/components/cases";
import { buttonVariants } from "@/components/ui/button-classes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type CaseDetailPageProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function getInheritanceHeirSummary(caseRecord: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseRecord) {
    return [];
  }

  return caseRecord.heirs
    .map((heir) => {
      const person = caseRecord.persons.find((entry) => entry.id === heir.personId);
      return {
        id: heir.id,
        name: person?.fullName ?? heir.personId,
        heirClass: heir.heirClass,
        share: `${heir.shareNumerator}/${heir.shareDenominator}`,
        status: heir.status
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;
  const caseRecord = await getCaseDetail(id);

  if (!caseRecord) {
    notFound();
  }

  const heirSummary = getInheritanceHeirSummary(caseRecord);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm shadow-slate-200/60 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CaseStatus status={caseRecord.status} />
            <CaseStatus status={caseRecord.matchingStatus} kind="matching" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
              Case detail
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{caseRecord.title}</h1>
            <p className="text-sm text-slate-600">
              作成: {formatDateTime(caseRecord.createdAt)} / 更新:{" "}
              {formatDateTime(caseRecord.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/cases/${id}/upload`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            文書を追加
          </Link>
          <Link
            href={`/cases/${id}/diagram`}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            図面を開く
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>文書</CardTitle>
            <CardDescription>アップロード済みの文書数</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{caseRecord.documents.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>人物</CardTitle>
            <CardDescription>抽出された人物数</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{caseRecord.persons.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>相続人</CardTitle>
            <CardDescription>確定済みの相続人件数</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{caseRecord.heirs.length}</CardContent>
        </Card>
      </section>

      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="documents">文書</TabsTrigger>
          <TabsTrigger value="persons">人物</TabsTrigger>
          <TabsTrigger value="inheritance">相続関係</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>文書一覧</CardTitle>
              <CardDescription>OCR とレビューの状態を確認します。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {caseRecord.documents.length === 0 ? (
                <p className="text-sm text-slate-500">まだ文書がありません。</p>
              ) : (
                caseRecord.documents.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CaseStatus status={document.status} />
                          {document.requiresReview ? (
                            <CaseStatus status="review" kind="matching" />
                          ) : null}
                        </div>
                        <h3 className="font-medium text-slate-900">
                          {document.originalFilename}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {document.documentType} / {formatDate(document.createdAt)}
                        </p>
                      </div>

                      <div className="space-y-1 text-right text-xs text-slate-500">
                        <p>
                          OCR 信頼度:{" "}
                          {document.ocrConfidence !== null &&
                          document.ocrConfidence !== undefined
                            ? document.ocrConfidence.toString()
                            : "未計測"}
                        </p>
                        <p>Tokens: {document.tokensUsed ?? "未計測"}</p>
                        <p>コスト: {formatCurrency(document.estimatedCostUsd)}</p>
                      </div>
                    </div>

                    {(document.reviewReason ?? []).length > 0 ? (
                      <p className="mt-3 text-sm text-amber-700">
                        要確認: {(document.reviewReason ?? []).join(" / ")}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persons">
          <PersonList persons={caseRecord.persons} deceasedPersonId={caseRecord.deceasedPersonId} />
        </TabsContent>

        <TabsContent value="inheritance">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <Card>
              <CardHeader>
                <CardTitle>相続結果</CardTitle>
                <CardDescription>
                  保存済みの相続計算結果と被相続人の関係を確認します。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">被相続人</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {caseRecord.deceasedPerson?.fullName ?? "未設定"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">死亡日</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {formatDate(caseRecord.deceasedPerson?.deathDate ?? null)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">相続人</p>
                  <RunInheritanceButton caseId={id} />
                  {heirSummary.length === 0 ? (
                    <p className="text-sm text-slate-500">相続人情報はまだありません。</p>
                  ) : (
                    <div className="space-y-2">
                      {heirSummary.map((heir) => (
                        <div
                          key={heir.id}
                          className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{heir.name}</p>
                            <p className="text-xs text-slate-500">{heir.heirClass}</p>
                          </div>
                          <div className="text-sm text-slate-600">
                            {heir.share} / {heir.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>図面へ</CardTitle>
                <CardDescription>図面ページで相続関係図のプレビューと PDF 出力を行います。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                <p>・人物と関係性を基にレイアウトを生成</p>
                <p>・PDF ダウンロードは図面ページから実行</p>
                <Link
                  href={`/cases/${id}/diagram`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  図面ページへ
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
