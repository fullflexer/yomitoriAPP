"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export interface GenerateDiagramButtonProps {
  caseId: string;
}

export function GenerateDiagramButton({ caseId }: GenerateDiagramButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/cases/${caseId}/diagram`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "図面を生成できませんでした。");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "図面を生成できませんでした。",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={running}>
        {running ? "生成中..." : "図面を生成"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
