import { test, expect } from "@playwright/test";

test("add 3D scatter → canvas renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "flea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();

  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("Plot kind").selectOption("scatter3d");
  await page.getByLabel("X variable").selectOption("tars1");
  await page.getByLabel("Y variable").selectOption("tars2");
  await page.getByLabel("Z variable").selectOption("head");
  await page.getByRole("button", { name: /^add$/i }).click();

  await expect(page.locator(".plot-head .vars").getByText(/tars1 × tars2 × head/)).toBeVisible();

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const box = c.getBoundingClientRect();
    return c.width > 0 && c.height > 0 && box.width > 100 && box.height > 100;
  });
  await canvas.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

  expect(errors).toEqual([]);
});
