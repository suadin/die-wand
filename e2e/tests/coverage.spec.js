const fs = require("fs");
const path = require("path");
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

const FILES = {
  "main.js": "main.js",
  "logic.js": "logic.js",
  "reader.js": "reader.js",
};

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineOf(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

function countFile(name, entry) {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "site", name), "utf8");
  const ranges = [];
  for (const fn of entry.functions || []) {
    for (const range of fn.ranges) ranges.push(range);
  }
  for (const range of entry.ranges || []) {
    ranges.push({
      startOffset: range.start,
      endOffset: range.end,
      count: range.count,
    });
  }
  ranges.sort((left, right) =>
    left.startOffset - right.startOffset || right.endOffset - left.endOffset);

  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }

  let covered = 0;
  let total = 0;
  for (let line = 0; line < starts.length; line += 1) {
    const from = starts[line];
    const to = line + 1 < starts.length ? starts[line + 1] : source.length;
    const text = source.slice(from, to);
    if (!text.trim()) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(text)) continue;
    total += 1;
    const offset = from + (text.length - text.trimStart().length);
    let count = 0;
    for (const range of ranges) {
      if (offset >= range.startOffset && offset < range.endOffset) count = range.count;
    }
    if (count > 0) covered += 1;
  }
  return { covered, total };
}

test("browser JS coverage is measured with page.coverage", async ({ page }) => {
  await page.route("http://127.0.0.1:8124/**", (route) => route.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (route) =>
    route.fulfill({ json: TILES }));
  await page.coverage.startJSCoverage();

  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(3);
  await page.locator("#readme-button").click();
  await expect(page.locator("#reader")).toBeVisible();
  for (const title of ["SPECS", "BASIC SPECS", "GUIDE", "README"]) {
    await page.getByRole("tab", { name: title, exact: true }).click();
    await expect(page.locator("#reader-title")).toHaveText(title);
  }
  await page.locator('.reader-section[aria-label="Tests"]').click();
  await page.locator('.reader-section[aria-label="Install"]').click();
  await page.locator("#reader-close").click();

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

  const coverage = await page.coverage.stopJSCoverage();
  let coveredLines = 0;
  let totalLines = 0;
  for (const entry of coverage) {
    const name = Object.keys(FILES).find((file) => entry.url.endsWith(`/${file}`));
    if (!name) continue;
    const { covered, total } = countFile(name, entry);
    coveredLines += covered;
    totalLines += total;
  }
  expect(totalLines).toBeGreaterThan(0);
  const percent = Number(((coveredLines / totalLines) * 100).toFixed(1));
  fs.writeFileSync(path.join(__dirname, "..", "coverage.json"), `${JSON.stringify({
    coveredLines,
    totalLines,
    percent,
  }, null, 2)}\n`);
  expect(percent).toBeGreaterThan(0);
});
