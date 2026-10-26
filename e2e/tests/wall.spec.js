const { test, expect } = require("@playwright/test");

const TILES = {
  version: 1,
  saved: "2026-10-26T00:00:00Z",
  tiles: [
    { title: "Diary", url: "https://diary.example/", glyph: "D" },
    { title: "Home Assistant", url: "https://ha.example/", glyph: "H" },
    { title: "Paperless", url: "https://paperless.example/", glyph: "P" },
  ],
};

const METRICS = {
  unit: {
    total: 122,
    coverage: null,
    failed: 0,
    duration: 16.2,
    perTest: 0.133,
    measured: "2026-10-26T18:00",
  },
  e2e: null,
};

async function openWall(page, metrics = METRICS) {
  await page.route("http://127.0.0.1:8124/**", (route) => route.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (route) =>
    route.fulfill({ json: TILES }));
  await page.route("http://127.0.0.1:8098/test-metrics.json", (route) =>
    route.fulfill({ json: metrics }));
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(3);
}

test("the wall shows tiles and a one-row header", async ({ page }) => {
  await openWall(page);
  await expect(page.locator("header h1")).toHaveText("DIE WAND");
  await expect(page.locator("header img.logo")).toBeVisible();
  const title = await page.locator("header h1").boundingBox();
  const tagline = await page.locator(".tagline").boundingBox();
  const titleMiddle = title.y + title.height / 2;
  const taglineMiddle = tagline.y + tagline.height / 2;
  expect(Math.abs(titleMiddle - taglineMiddle)).toBeLessThan(4);
  await expect(page.locator(".footer-item")).toHaveCount(4);
  await expect(page.locator(".footer-sep")).toHaveCount(3);
  await expect(page.locator(".footer-items svg")).toHaveCount(4);
});

test("README opens the reader and a deep link survives a reload", async ({ page }) => {
  await openWall(page);
  await page.locator("#readme-button").click();
  await expect(page.locator("#reader")).toBeVisible();
  await expect(page.locator(".reader-tab")).toHaveCount(5);
  await page.locator('.reader-section[aria-label="Tests"]').click();
  await expect(page).toHaveURL(/#\/docs\/readme\/tests$/);
  await page.reload();
  await expect(page.locator("#reader")).toBeVisible();
  await expect(page.locator("#reader-section-title")).toHaveText("Tests");
  await expect(page.locator(".reader-tab.active")).toHaveText("README");
});

test("each section has its own icon", async ({ page }) => {
  await openWall(page);
  await page.locator("#readme-button").click();
  await expect(page.locator("#reader-sections .reader-section").first()).toBeVisible();
  const icons = await page.locator("#reader-sections svg").evaluateAll(
    (nodes) => nodes.map((node) => node.innerHTML),
  );
  expect(icons.length).toBeGreaterThan(5);
  expect(new Set(icons).size).toBe(icons.length);
});

test("the reader lists every document", async ({ page }) => {
  await openWall(page);
  await page.locator("#readme-button").click();
  await expect(page.locator(".reader-tab")).toHaveText([
    "README", "SPECS", "SPECS basic", "GUIDE", "RELEASE NOTES",
  ]);
  await page.locator(".reader-tab", { hasText: "SPECS" }).first().click();
  await expect(page.locator("#reader-title")).toHaveText("SPECS");
  await page.locator(".reader-tab", { hasText: "RELEASE NOTES" }).click();
  await expect(page.locator("#reader-title")).toHaveText("RELEASE NOTES");
  await expect(page.locator("#reader-body")).toContainText("0.3.0");
  await expect(page.locator("#reader-sections")).toBeHidden();
});

test("a test that has not run is red with a plain tooltip", async ({ page }) => {
  await openWall(page);
  await expect(page.locator("#unit-label")).toHaveText(/unit 122 tests/);
  await expect(page.locator("#e2e-metrics")).toHaveClass(/failed/);
  await expect(page.locator("#e2e-label")).toHaveText("not executed");
  await page.locator("#e2e-metrics").hover();
  await expect(page.locator("#tooltip")).toHaveText("not executed");
});

test("a test tooltip always has three rows", async ({ page }) => {
  await openWall(page);
  await page.locator("#unit-metrics").hover();
  const text = await page.locator("#tooltip").innerText();
  const rows = text.split("\n");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatch(/^Measured /);
  expect(rows[1]).toMatch(/^Duration .* s$/);
  expect(rows[2]).toMatch(/^Per test .* s$/);
});

test("a measured E2E run replaces the red state", async ({ page }) => {
  await openWall(page, {
    ...METRICS,
    e2e: {
      total: 10, failed: 0, coverage: null,
      duration: 24, perTest: 2.4, measured: "2026-10-26T18:05",
    },
  });
  await expect(page.locator("#e2e-metrics")).not.toHaveClass(/failed/);
  await expect(page.locator("#e2e-label")).toHaveText("e2e 10 journeys · coverage not measured");
});

test("cursors say what a thing does", async ({ page }) => {
  await openWall(page);
  await expect(page.locator("#readme-button")).toHaveCSS("cursor", "pointer");
  await expect(page.locator("#unit-metrics")).toHaveCSS("cursor", "help");
  await expect(page.locator(".tagline")).toHaveCSS("cursor", "auto");
});

test("the layout fits at 800 px and follows browser zoom", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openWall(page);
  const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(root).toBe("16px");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator("header h1")).toBeVisible();
  await expect(page.locator(".footer")).toBeVisible();
});

test("dropping a bookmark file replaces the wall", async ({ page }) => {
  await openWall(page);
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>'
    + '<DT><A HREF="https://drop.example/">Dropped</A></DL>';
  await page.evaluate((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], "bookmarks.html", { type: "text/html" }));
    document.dispatchEvent(new DragEvent("drop", {
      dataTransfer: transfer, bubbles: true, cancelable: true,
    }));
  }, html);
  await expect(page.locator(".tile")).toHaveCount(1);
  await expect(page.locator(".tile .title")).toHaveText("Dropped");
});

test("an unknown route returns to the wall", async ({ page }) => {
  await openWall(page);
  await page.goto("/#/elsewhere");
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator(".tile")).toHaveCount(3);
});
