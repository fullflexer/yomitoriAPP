"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export interface DocumentUploaderProps {
  caseId: string;
}

type PresignResponse = {
  uploadUrl?: string;
  r2Key?: string;
  error?: string;
};

type CommitResponse = {
  error?: string;
};

export function DocumentUploader({ caseId }: DocumentUploaderProps) {
  const router = useRouter();
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const isDisabled = !consentChecked || selectedFiles.length === 0 || submitting;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      setError("アップロードするファイルを選択してください。");
      return;
    }

    if (!consentChecked) {
      setError("OCR 処理の実行に同意してください。");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const errors: string[] = [];
    let uploaded = 0;

    for (const file of selectedFiles) {
      setProgress({ current: uploaded + 1, total: selectedFiles.length });
      try {
        const contentType = file.type || "application/octet-stream";
        const presignResponse = await fetch(`/api/cases/${caseId}/documents/presign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: file.name,
            contentType,
            consent: true,
          }),
        });
        const presignPayload = (await presignResponse.json()) as PresignResponse;

        if (
          !presignResponse.ok ||
          !presignPayload.uploadUrl ||
          !presignPayload.r2Key
        ) {
          errors.push(
            `${file.name}: ${presignPayload.error ?? "署名付きURLの取得に失敗しました。"}`,
          );
          continue;
        }

        const uploadResponse = await fetch(presignPayload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          errors.push(`${file.name}: ストレージへのアップロードに失敗しました。`);
          continue;
        }

        const commitResponse = await fetch(`/api/cases/${caseId}/documents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            r2Key: presignPayload.r2Key,
            originalFilename: file.name,
            documentType: "computerized_koseki",
            consent: true,
          }),
        });
        const commitPayload = (await commitResponse.json()) as CommitResponse;

        if (!commitResponse.ok) {
          errors.push(`${file.name}: ${commitPayload.error ?? "登録に失敗しました。"}`);
          continue;
        }

        uploaded++;
      } catch (submitError) {
        errors.push(
          `${file.name}: ${submitError instanceof Error ? submitError.message : "失敗"}`,
        );
      }
    }

    setProgress(null);

    if (errors.length > 0) {
      setError(`${errors.length}件失敗:\n${errors.join("\n")}`);
    }
    if (uploaded > 0) {
      setSuccess(`${uploaded}件アップロード完了。OCR 処理を開始します。`);
      startTransition(() => {
        router.push(`/cases/${caseId}`);
        router.refresh();
      });
    }

    setSubmitting(false);
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
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-50 hover:file:bg-slate-800"
              />
            </label>
            {selectedFiles.length > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-sm font-medium text-slate-700">{selectedFiles.length}件選択中:</p>
                {selectedFiles.map((f, i) => (
                  <p key={i} className="text-xs text-slate-500">・{f.name}</p>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Checkbox
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span className="text-sm leading-6 text-slate-700">
              戸籍画像の OCR 処理を実行することに同意します
            </span>
          </label>

          <p className="text-xs text-slate-500">
            同意がない場合、OCR 処理は開始されません。
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
              {submitting && progress
                ? `送信中... (${progress.current}/${progress.total})`
                : selectedFiles.length > 1
                  ? `${selectedFiles.length}件アップロード`
                  : "アップロード"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
