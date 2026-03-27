import { notFound } from "next/navigation";

import { getCaseDetail } from "@/app/(dashboard)/_lib/cases";
import { DocumentUploader } from "@/components/upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type UploadPageProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export default async function CaseUploadPage({ params }: UploadPageProps) {
  const { id } = await params;
  const caseRecord = await getCaseDetail(id);

  if (!caseRecord) {
    notFound();
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <DocumentUploader caseId={caseRecord.id} />

      <Card>
        <CardHeader>
          <CardTitle>アップロード前の確認</CardTitle>
          <CardDescription>送信前に同意フローと OCR 実行条件を確認します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
          <p>・文書は PDF または画像を選択します。</p>
          <p>・同意チェックが入るまでアップロードボタンは無効です。</p>
          <p>・ブラウザから直接ストレージへアップロード後、documents API で OCR ジョブをキュー投入します。</p>
        </CardContent>
      </Card>
    </div>
  );
}
