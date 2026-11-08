const { test, expect } = require("@playwright/test");

// die-wand journeys: the wall, the import, and the automated-test list in the
// docs. The footer, reader, layout, design and version states are the package's
// own suite.

const TILES = {
  version: 1,
  saved: "2026-10-26T00:00:00Z",
  tiles: [
    { title: "Diary", url: "https://diary.example/", glyph: "D" },
    { title: "Home Assistant", url: "https://ha.example/", glyph: "H" },
    { title: "Paperless", url: "https://paperless.example/", glyph: "P" },
  ],
};

async function openWall(page, metrics = null) {
  await page.route("http://127.0.0.1:8124/**", (route) => route.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (route) =>
    route.fulfill({ json: TILES }));
  if (metrics) {
    await page.route("http://127.0.0.1:8098/test-metrics.json", (route) =>
      route.fulfill({ json: metrics }));
  }
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(3);
  await expect(page.locator("#app-version")).toHaveText("0.5.0");
}

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

test("specs list the tests that verify them", async ({ page }) => {
  await openWall(page);
  await page.goto("/#/docs/norm/reader");
  await expect(page.locator(".doc-tests")).toBeVisible();
  await expect(page.locator(".doc-tests")).toContainText("Automated tests");
  await expect(page.locator(".doc-test-kind").first()).toContainText("Unit ·");
  await expect(page.locator(".doc-tests")).toContainText("icons in one row are unique");
  await page.goto("/#/docs/app-specs/reading-chrome");
  await expect(page.locator(".doc-tests")).toContainText("bitmap is embedded");
});

test("an unknown route returns to the wall", async ({ page }) => {
  await openWall(page);
  await page.goto("/#/elsewhere");
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator(".tile")).toHaveCount(3);
});
