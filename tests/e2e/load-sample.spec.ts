// tests/e2e/load-sample.spec.ts
import { test, expect } from "@playwright/test";

test("load flea sample → schema preview → variable panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/no data/i)).toBeVisible();
  await page.getByRole("button", { name: "flea" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await page.getByLabel("show variables panel").first().click();
  const varList = page.getByTestId("variable-list");
  await expect(varList.getByText("tars1")).toBeVisible();
  await expect(varList.getByText("species")).toBeVisible();
  await expect(page.getByText(/74 of 74 visible/)).toBeVisible();
});
