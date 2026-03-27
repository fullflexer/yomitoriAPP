"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewCaseForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("案件タイトルを入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "案件を作成できませんでした。");
      }

      startTransition(() => {
        router.push(`/cases/${payload.id}`);
        router.refresh();
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "案件を作成できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="case-title">
          案件タイトル
        </label>
        <Input
          id="case-title"
          name="title"
          placeholder="例: 山田家 相続案件"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={submitting}
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "作成中..." : "案件を作成"}
        </Button>
      </div>
    </form>
  );
}
