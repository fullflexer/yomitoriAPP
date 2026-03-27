"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export interface RunInheritanceButtonProps {
  caseId: string;
}

export function RunInheritanceButton({ caseId }: RunInheritanceButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/cases/${caseId}/inheritance`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "相続判定を実行できませんでした。");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "相続判定を実行できませんでした。",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={running}>
        {running ? "判定中..." : "相続判定を実行"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
