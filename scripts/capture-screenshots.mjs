import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TGOBI_SCREENSHOT_URL ?? "http://127.0.0.1:8787";
const outDir = "docs/screenshots";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await screenshot("start-screen.png");

  await loadFlea();
  await page.getByLabel("show variables panel").click();
  await addScatter("tars1", "tars2");
  await screenshot("flea-workspace.png");

  await addScatter("aede1", "aede2");
  await page.getByLabel("color encoding").selectOption("byVar");
  await page.getByLabel("color variable").selectOption("species");
  await page.getByLabel("color scale").selectOption("categorical");
  await page.getByLabel("palette").selectOption("tableau10");
  await page.getByLabel("start tour").click();
  await page.waitForTimeout(400);
  await brushScatterByHeader("linked-brush-and-tour.png", /^tour:/);

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await loadFlea();
  await page.getByLabel("show variables panel").click();
  await addScatter("tars1", "tars2");
  await addParcoords();
  await addBarchart("species");
  await moveBarchartBelowParcoords();
  await page.getByLabel("color encoding").selectOption("byVar");
  await page.getByLabel("color variable").selectOption("species");
  await page.getByLabel("color scale").selectOption("categorical");
  await page.getByLabel("palette").selectOption("tableau10");
  await setPointSize(5);
  await page.getByLabel("start tour").click();
  await page.waitForTimeout(400);
  await brushBarchartAndScreenshot("tour-parcoords-barchart-selection.png", "species");
} finally {
  await browser.close();
}

async function loadFlea() {
  await page.getByRole("button", { name: "flea" }).click();
  await page.getByRole("button", { name: "Load" }).click();
  await page.getByText(/74 of 74 visible/).waitFor();
}

async function addScatter(x, y) {
  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("Plot type").selectOption("scatter");
  await page.getByLabel("X variable").selectOption(x);
  await page.getByLabel("Y variable").selectOption(y);
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.locator(".plot-head .vars", { hasText: new RegExp(`${x}\\s*(?:x|\\u00d7)\\s*${y}`) }).waitFor();
}

async function addParcoords() {
  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("Plot type").selectOption("parcoords");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.locator(".tile-tab", { hasText: /^parcoords\(/ }).waitFor();
}

async function addBarchart(variable) {
  await page.getByRole("button", { name: /add plot/i }).click();
  await page.getByLabel("Plot type").selectOption("barchart");
  await page.getByLabel("Bar variable").selectOption(variable);
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.locator(".tile-tab", { hasText: variable }).waitFor();
}

async function moveBarchartBelowParcoords() {
  const barchartTab = page.locator(".tile-tab", { hasText: "species" }).first();
  const parcoordsLeaf = page
    .locator(".tile-leaf")
    .filter({ has: page.locator(".tile-tab", { hasText: /^parcoords\(/ }) })
    .first();

  const source = await barchartTab.boundingBox();
  const target = await parcoordsLeaf.boundingBox();
  if (!source || !target) throw new Error("could not locate plot tabs for screenshot layout");

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 6, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function setPointSize(size) {
  await page.getByLabel("point size").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, size);
}

async function brushScatterByHeader(screenshotName, headerPattern) {
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  const card = page
    .locator(".plot-card")
    .filter({ has: page.locator(".vars", { hasText: headerPattern }) })
    .first();
  const canvas = card.locator("canvas").last();
  await canvas.waitFor();
  await canvas.evaluate((c) => new Promise((resolve) => {
    const ready = () => {
      const box = c.getBoundingClientRect();
      if (box.width > 200 && box.height > 200) resolve(undefined);
      else requestAnimationFrame(ready);
    };
    ready();
  }));
  await page.waitForTimeout(300);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas bounding box");

  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 12 });
  await page.getByText(/\d+ selected/).waitFor({ timeout: 2_000 });
  await screenshot(screenshotName);
  await page.mouse.up();
}

async function brushBarchartAndScreenshot(screenshotName, variable) {
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  const firstBar = page.locator(`[data-testid="bar-${variable}-0"]`).first();
  const secondBar = page.locator(`[data-testid="bar-${variable}-1"]`).first();
  await firstBar.waitFor();
  await secondBar.waitFor();

  const first = await firstBar.boundingBox();
  const second = await secondBar.boundingBox();
  if (!first || !second) throw new Error("could not locate barchart bars for screenshot selection");

  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 8 });
  await page.getByText(/\d+ selected/).waitFor({ timeout: 2_000 });
  await screenshot(screenshotName);
  await page.mouse.up();
}

async function screenshot(name) {
  await page.screenshot({
    path: join(outDir, name),
    animations: "disabled",
  });
}
