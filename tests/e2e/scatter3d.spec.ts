import { test, expect } from "@playwright/test";

test("3D scatter is experimental and not in add-plot menu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "flea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();

  await page.getByRole("button", { name: /add plot/i }).click();
  // scatter3d is intentionally not exposed in the AddPlotMenu yet (experimental)
  const select = page.getByLabel("Plot type");
  await expect(select).toBeVisible();
  const options = await select.locator("option").allTextContents();
  expect(options).not.toContain("scatter3d");

  expect(errors).toEqual([]);
});
