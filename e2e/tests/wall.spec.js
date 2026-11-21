import { test, expect } from "@playwright/test";

// die-wand journeys: the wall, the import, the footer link to the reports.

const TILES = {
  version: 1,
  saved: "2026-10-26T00:00:00Z",
  tiles: [
    { title: "Diary", url: "https://diary.example/", glyph: "D" },
    { title: "Home Assistant", url: "https://ha.example/", glyph: "H" },
    { title: "Paperless", url: "https://paperless.example/", glyph: "P" },
  ],
};

async function openWall(page) {
  await page.route("http://127.0.0.1:8124/**", (route) => route.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (route) =>
    route.fulfill({ json: TILES }));
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(3);
}

test("the wall shows the tiles from tiles.json", async ({ page }) => {
  await openWall(page);
  await expect(page.locator(".tile .title").first()).toHaveText("Diary");
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

test("the footer links to the test reports", async ({ page }) => {
  await openWall(page);
  const link = page.locator("footer a", { hasText: "Tests" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "test/index.html");
});

test("an unknown hash route keeps the wall", async ({ page }) => {
  await openWall(page);
  await page.goto("/#/elsewhere");
  await expect(page.locator(".tile")).toHaveCount(3);
});
