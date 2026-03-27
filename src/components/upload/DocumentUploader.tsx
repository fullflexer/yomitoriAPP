"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export interface DocumentUploaderProps {
  caseId: string;
}

export function DocumentUploader({ caseId }: DocumentUploaderProps) {
  const router = useRouter();
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDisabled = !consentChecked || !selectedFile || submitting;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setError("アップロードするファイルを選択してください。");
      return;
    }

    if (!consentChecked) {
      setError("Claude Vision API への送信同意が必要です。");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("consent", "true");
      formData.set("documentType", "computerized_koseki");

      const response = await fetch(`/api/cases/${caseId}/documents`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "アップロードに失敗しました。");
      }

      setSuccess("アップロードしました。OCR 処理を開始します。");
      startTransition(() => {
        router.push(`/cases/${caseId}`);
        router.refresh();
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "アップロードに失敗しました。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>文書を追加</CardTitle>
        <CardDescription>
          画像またはPDFを選択し、同意を確認してからアップロードします。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <label className="block cursor-pointer space-y-2">
              <span className="text-sm font-medium text-slate-700">
                ファイルを選択
              </span>
              <input
                type="file"
                name="file"
                accept="application/pdf,image/*"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-50 hover:file:bg-slate-800"
              />
            </label>
            {selectedFile ? (
              <p className="mt-3 text-sm text-slate-600">選択中: {selectedFile.name}</p>
            ) : null}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Checkbox
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span className="text-sm leading-6 text-slate-700">
              戸籍画像をClaude Vision API（Anthropic社）に送信することに同意します
            </span>
          </label>

          <p className="text-xs text-slate-500">
            同意がない場合、OCR と Claude Vision API は呼び出されません。
          </p>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">案件ID: {caseId}</p>
            <Button
              type="submit"
              disabled={isDisabled}
              title={
                consentChecked
                  ? undefined
                  : "同意チェックを入れるまでアップロードできません。"
              }
            >
              {submitting ? "送信中..." : "アップロード"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
