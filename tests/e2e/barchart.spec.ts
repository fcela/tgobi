import { test, expect } from "@playwright/test";

test("flea sample can add a barchart and brush a bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "flea" }).click();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();

  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("Plot type").selectOption("barchart");
  await page.getByLabel("Bar variable").selectOption("species");
  await page.getByRole("button", { name: /^add$/i }).click();

  await expect(page.getByText("bar: species")).toBeVisible();
  const firstBar = page.getByTestId("bar-species-0");
  await expect(firstBar).toBeVisible();
  const box = await firstBar.boundingBox();
  if (!box) throw new Error("no bounding box for barchart bar");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByText(/\d+ selected/)).toBeVisible();
  await page.mouse.up();
});
