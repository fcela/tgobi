import { test, expect } from "@playwright/test";

test("flea → 2D tour starts and runs without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "flea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();

  // Add a scatter so the tour has a target.
  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("X variable").selectOption("tars1");
  await page.getByLabel("Y variable").selectOption("tars2");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.locator(".plot-head .vars").getByText(/tars1 × tars2/)).toBeVisible();

  // Start the tour.
  await page.getByRole("button", { name: /start tour/i }).click();
  // Header should switch to tour: ...
  await expect(page.getByText(/tour:/)).toBeVisible({ timeout: 4000 });

  // Switch the running grand tour to a projection-pursuit guided tour.
  await page.getByLabel("tour mode").selectOption("pp");
  await expect(page.getByLabel("projection pursuit goal")).toBeVisible();
  await page.getByLabel("projection pursuit goal").selectOption("pca");
  await expect(page.locator(".tour-panel .row").filter({ hasText: "Score" }).locator("small"))
    .toHaveText(/^\d+\.\d{3}$/);
  await page.getByLabel("projection pursuit goal").selectOption("lda");
  await expect(page.getByLabel("LDA class variable")).toBeVisible();
  await page.getByLabel("LDA class variable").selectOption("species");
  await expect(page.locator(".tour-panel .row").filter({ hasText: "Score" }).locator("small"))
    .toHaveText(/^\d+\.\d{3}$/);

  // Pause then save a view.
  await page.getByRole("button", { name: /pause tour/i }).click();
  page.once("dialog", (d) => d.accept("origin"));
  await page.getByRole("button", { name: /save view/i }).click();
  await expect(page.getByText("origin")).toBeVisible();

  // Stop the tour.
  await page.getByRole("button", { name: /stop tour/i }).click();
  await expect(page.locator(".plot-head .vars").getByText(/tars1 × tars2/)).toBeVisible();

  expect(errors).toEqual([]);
});
