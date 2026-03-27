import path from "node:path";

import { expect, test } from "@playwright/test";

test("Basic Auth + case create + consent upload + inheritance + diagram", async ({
  page,
}: {
  page: any;
}) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "案件一覧" })).toBeVisible();

  await page.getByRole("link", { name: "案件を作成" }).click();
  await page.getByLabel("案件タイトル").fill("E2E 山田家");
  await page.getByRole("button", { name: "案件を作成" }).click();

  await page.waitForURL(/\/cases\/[^/]+$/);
  const caseId = page.url().split("/").pop();
  expect(caseId).toBeTruthy();

  await page.goto(`/cases/${caseId}/upload`);
  await expect(
    page.getByText("戸籍画像をClaude Vision API（Anthropic社）に送信することに同意します"),
  ).toBeVisible();

  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve(process.cwd(), "tests/fixtures/gold-standard/koseki-001.png"));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "アップロード" }).click();

  await page.waitForURL(new RegExp(`/cases/${caseId}$`));
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/cases/${caseId}/documents`);
      const payload = (await response.json()) as Array<{ status?: string }>;
      return payload[0]?.status ?? "missing";
    })
    .toBe("ocr_complete");

  await page.reload();
  await page.getByRole("tab", { name: "人物" }).click();
  await expect(page.getByText("山田 太郎")).toBeVisible();
  await expect(page.getByText("山田 花子")).toBeVisible();

  await page.getByRole("tab", { name: "相続関係" }).click();
  await page.getByRole("button", { name: "相続判定を実行" }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/cases/${caseId}/inheritance`);
      const payload = (await response.json()) as { heirs?: Array<unknown> };
      return payload.heirs?.length ?? 0;
    })
    .toBe(2);

  await page.getByRole("link", { name: "図面を開く" }).click();
  await page.getByRole("button", { name: "図面を生成" }).click();
  await expect(page.getByText("PDF をダウンロード")).toBeVisible();
});
