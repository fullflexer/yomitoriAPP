import { NewCaseForm } from "@/components/cases";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>案件作成</CardTitle>
          <CardDescription>
            タイトルを入力すると新しい案件を作成し、詳細画面へ移動します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
          <p>作成後は文書アップロード、OCR、相続判定、図面生成へ進めます。</p>
          <NewCaseForm />
        </CardContent>
      </Card>
    </div>
  );
}
