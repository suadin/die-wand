import { test, expect } from "@playwright/test";

// One video for the whole happy path: empty wall → add bookmarks → refresh →
// tiles visible. The screencast records a single file, draws the mouse cursor,
// a marker on every click and a chapter title before each step.

test.describe.configure({ mode: "serial" });

const BOOKMARKS_HTML = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>'
  + '<DT><H3>Bookmarks bar</H3><DL><p>'
  + '<DT><A HREF="https://diary.example/">Diary</A>'
  + '<DT><A HREF="https://ha.example/">Home Assistant</A>'
  + '<DT><A HREF="https://paperless.example/">Paperless</A>'
  + '</DL></DL>';

test("die-wand happy path", async ({ page }, testInfo) => {
  // No Chrome helper, and an empty tiles.json: the wall starts empty.
  await page.route("http://127.0.0.1:8124/**", (r) => r.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (r) =>
    r.fulfill({ json: { version: 1, saved: "", tiles: [] } }));

  const videoPath = testInfo.outputPath("journey.webm");
  await page.screencast.start({ path: videoPath, size: { width: 1280, height: 900 } });
  await page.screencast.showActions({
    cursor: "pointer",
    duration: 700,
    style: {
      point: "width: 18px; height: 18px; border-radius: 50%; background: #dc3545; box-shadow: 0 0 0 5px rgba(220,53,69,.25)",
      highlight: "outline: 3px solid #d6336c; background: rgba(214,51,108,.10); border-radius: 8px",
      title: "font-size: 14px; background: #212529; color: #fff; padding: 3px 9px; border-radius: 5px",
    },
  });

  // Chapter title first, then a short beat, then the action — so the label is
  // on screen while the step below it runs.
  const chapter = (title, description) =>
    page.screencast.showChapter(title, { description, duration: 2200 });
  const beat = () => page.waitForTimeout(1600);

  // 1 · empty wall
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  chapter("1 · Leere Wand", "Keine Kacheln, die Wand zeigt einen Hinweis.");
  await beat();
  await page.reload();
  await expect(page.locator(".tile")).toHaveCount(0);
  await expect(page.locator("#notice")).toContainText("No tiles yet");

  // 2 · add bookmarks
  chapter("2 · Lesezeichen hinzufügen", "Eine Bookmark-Datei wird auf die Wand gezogen.");
  await beat();
  await page.mouse.move(640, 450, { steps: 15 });
  await page.mouse.click(640, 450);
  await page.evaluate((html) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([html], "bookmarks.html", { type: "text/html" }));
    document.dispatchEvent(new DragEvent("drop", {
      dataTransfer: transfer, bubbles: true, cancelable: true,
    }));
  }, BOOKMARKS_HTML);
  await expect(page.locator(".tile")).toHaveCount(3);

  // 3 · refresh
  chapter("3 · Aktualisieren", "Die Seite wird neu geladen.");
  await beat();
  await page.reload();
  await expect(page.locator(".tile")).toHaveCount(3);

  // 4 · tiles visible
  chapter("4 · Kacheln sichtbar", "Die Kacheln sind wieder da.");
  await beat();
  await expect(page.locator(".tile .title").first()).toHaveText("Diary");

  await page.screencast.stop();
  await testInfo.attach("journey", { path: videoPath, contentType: "video/webm" });
});
