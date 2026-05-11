import { test, expect } from "@playwright/test";

test("flea -> 2 scatters -> brush updates status, color-by-var works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "flea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();

  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("X variable").selectOption("tars1");
  await page.getByLabel("Y variable").selectOption("tars2");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.locator(".plot-head .vars").getByText(/tars1 × tars2/)).toBeVisible();

  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("X variable").selectOption("aede1");
  await page.getByLabel("Y variable").selectOption("aede2");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.locator(".plot-head .vars").getByText(/aede1 × aede2/)).toBeVisible();

  const firstCanvas = page.locator("canvas").first();
  await expect(firstCanvas).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return false;
    const box = canvas.getBoundingClientRect();
    return canvas.width > 0 && canvas.height > 0 && box.width > 100 && box.height > 100;
  });
  await firstCanvas.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const box = await firstCanvas.boundingBox();
  if (!box) throw new Error("no bounding box for canvas");

  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 12 });
  await expect(page.getByText(/\d+ selected/)).toBeVisible({ timeout: 2_000 });
  await page.mouse.up();

  await page.getByLabel(/color encoding/i).selectOption("byVar");
  await page.getByLabel(/color variable/i).selectOption("species");
  await page.getByLabel(/color scale/i).selectOption("categorical");

  expect(errors).toEqual([]);
});
