import { test, expect } from "@playwright/test";
import {mockExtension} from "./extension-mock.js";

// die-wand journeys: the wall, the import, the footer link to the reports.

const TILES = {
  version: 1,
  saved: "2026-10-26T00:00:00Z",
  tiles: [
    { title: "Diary", url: "https://diary.example/", glyph: "D", guid: "diary-1" },
    { title: "Home Assistant", url: "https://ha.example/", glyph: "H", guid: "ha-1" },
    { title: "Paperless", url: "https://paperless.example/", glyph: "P", guid: "paperless-1" },
  ],
};

async function openWall(page, extension = false, tiles = TILES.tiles) {
  await page.route("http://127.0.0.1:8124/**", (route) => route.abort());
  await page.route("http://127.0.0.1:8098/tiles.json", (route) =>
    route.fulfill({ json: TILES }));
  if (extension)
    await mockExtension(page, tiles);
  await page.goto("/");
  await expect(page.locator(".tile")).toHaveCount(tiles.reduce((n, tile) =>
    n + (tile.url ? 1 : (tile.children?.length ?? 0)), 0));
}

test("the wall shows the tiles from tiles.json", async ({ page }) => {
  await openWall(page);
  await expect(page.locator(".tile .title").first()).toHaveText("Diary");
});

test("dark mode follows the system and the toggle persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openWall(page);
  await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

  const toggle = page.getByRole("button", { name: "Dark mode" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const header = await page.locator("header .container-fluid").boundingBox();
  const button = await toggle.boundingBox();
  expect(button.x + button.width).toBeGreaterThan(header.x + header.width - 40);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "light");
});

test("the notice is centered without moving header buttons", async ({ page }) => {
  await openWall(page, true);
  const toggle = page.getByRole("button", {name: "Dark mode"});
  const before = await toggle.boundingBox();
  page.on("dialog", dialog => dialog.accept());

  const first = page.locator(".tile-cell").first();
  await first.hover();
  await first.getByRole("button", {name: "Diary löschen"}).click();
  await expect(page.locator("#notice")).toBeVisible();

  const after = await toggle.boundingBox();
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  const notice = await page.locator("#notice").boundingBox();
  expect(Math.abs(notice.x + notice.width / 2 - 640)).toBeLessThan(2);
  expect(notice.y).toBeLessThan(40);
});

test("tiles stay compact on a large screen", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openWall(page);
  const box = await page.locator(".tile").first().boundingBox();
  expect(box.width).toBeLessThan(180);
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

test("a tile cannot start a native link or image drag", async ({ page }) => {
  await openWall(page, true);
  const prevented = await page.locator(".tile").first().evaluate(element => {
    const event = new DragEvent("dragstart", {
      bubbles: true, cancelable: true, dataTransfer: new DataTransfer(),
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("dropping an icon file keeps the current wall", async ({ page }) => {
  await openWall(page);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "icon.png", {
      type: "image/png",
    }));
    document.dispatchEvent(new DragEvent("drop", {
      dataTransfer: transfer, bubbles: true, cancelable: true,
    }));
  });
  await expect(page.locator(".tile")).toHaveCount(3);
  await expect(page.locator("#notice")).toContainText("no bookmarks found");
});

test("the static wall has no delete buttons without the extension", async ({ page }) => {
  await openWall(page);
  await expect(page.locator(".delete-tile")).toHaveCount(0);
});

test("deleting a tile removes it from Chrome and survives a reload", async ({ page }) => {
  await openWall(page, true);
  page.on("dialog", dialog => dialog.accept());

  const first = page.locator(".tile-cell").first();
  await first.hover();
  await first.getByRole("button", {name: "Diary löschen"}).click();

  await expect(page.locator(".tile")).toHaveCount(2);
  await expect(page.locator(".tile .title", {hasText: "Diary"})).toHaveCount(0);
  await expect(page.locator("#notice")).toContainText("aus Chrome gelöscht");

  await page.reload();
  await expect(page.locator(".tile")).toHaveCount(2);
  await expect(page.locator(".tile .title", {hasText: "Diary"})).toHaveCount(0);
});

test("cancelling the confirmation keeps the bookmark", async ({ page }) => {
  await openWall(page, true);
  page.on("dialog", dialog => dialog.dismiss());

  const first = page.locator(".tile-cell").first();
  await first.hover();
  await first.getByRole("button", {name: "Diary löschen"}).click();

  await expect(page.locator(".tile")).toHaveCount(3);
  await expect(page.locator(".tile .title", {hasText: "Diary"})).toHaveCount(1);
});

test("a bookmark can be edited and assigned to another folder", async ({ page }) => {
  const tiles = [
    {title: "Diary", url: "https://diary.example/", guid: "diary-1"},
    {title: "Work", guid: "folder-1", children: []},
  ];
  await openWall(page, true, tiles);

  const first = page.locator(".tile-cell").first();
  await first.hover();
  await first.getByRole("button", {name: "Diary bearbeiten"}).click();
  await page.getByLabel("Name").fill("Renamed diary");
  await page.getByLabel("Adresse").fill("https://new.example/");
  await page.getByLabel("Ordner").selectOption({label: "Work"});
  await page.getByRole("button", {name: "Speichern"}).click();

  await expect(page.locator(".tile .title")).toHaveText("Renamed diary");
  await expect(page.locator(".tile")).toHaveAttribute("href", "https://new.example/");
  const tree = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("die-wand.test.extension.tiles") || "[]"));
  expect(tree.find(tile => tile.guid === "folder-1").children[0]).toMatchObject({
    title: "Renamed diary", url: "https://new.example/",
  });
});

test("left and right arrows reorder inside the folder and keep focus", async ({ page }) => {
  const tiles = [{title: "Work", guid: "folder-1", children: [
    {title: "One", url: "https://one.example/", guid: "one"},
    {title: "Two", url: "https://two.example/", guid: "two"},
    {title: "Three", url: "https://three.example/", guid: "three"},
  ]}];
  await openWall(page, true, tiles);
  const order = () => page.evaluate(() => {
    const tree = JSON.parse(sessionStorage.getItem("die-wand.test.extension.tiles") || "[]");
    return tree[0].children.map(tile => tile.guid);
  });

  const second = page.locator(".tile-cell", {hasText: "Two"}).locator("a");
  await second.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(order).toEqual(["two", "one", "three"]);
  await expect(page.locator(".tile-cell", {hasText: "Two"}).locator("a")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect.poll(order).toEqual(["one", "two", "three"]);
  await expect(page.locator(".tile-cell", {hasText: "Two"}).locator("a")).toBeFocused();
});

test("reorder arrows hide at the folder boundaries", async ({ page }) => {
  const tiles = [{title: "Work", guid: "folder-1", children: [
    {title: "One", url: "https://one.example/", guid: "one"},
    {title: "Two", url: "https://two.example/", guid: "two"},
    {title: "Three", url: "https://three.example/", guid: "three"},
  ]}];
  await openWall(page, true, tiles);
  const first = page.locator(".tile-cell", {hasText: "One"});
  const middle = page.locator(".tile-cell", {hasText: "Two"});
  const last = page.locator(".tile-cell", {hasText: "Three"});

  await expect(first.locator(".reorder-left")).toHaveCount(0);
  await expect(first.locator(".reorder-right")).toHaveCSS("opacity", "0");
  await first.hover();
  await expect(first.locator(".reorder-right")).toHaveCSS("opacity", "1");
  await expect(middle.locator(".reorder-left")).toBeVisible();
  await expect(middle.locator(".reorder-right")).toBeVisible();
  await expect(last.locator(".reorder-left")).toBeVisible();
  await expect(last.locator(".reorder-right")).toHaveCount(0);

  await first.getByRole("button", {name: "One nach rechts verschieben"}).click();
  await expect.poll(() => page.evaluate(() => {
    const tree = JSON.parse(sessionStorage.getItem("die-wand.test.extension.tiles") || "[]");
    return tree[0].children.map(tile => tile.guid);
  })).toEqual(["two", "one", "three"]);
});

test("a Chrome internal tile opens through the extension", async ({ page }) => {
  await openWall(page, true, [
    {title: "Extensions", url: "chrome://extensions/", guid: "extensions"},
  ]);
  await page.locator(".tile").click();
  await expect.poll(() => page.evaluate(() =>
    sessionStorage.getItem("die-wand.test.opened"))).toBe("chrome://extensions/");
  expect(page.url()).toContain("127.0.0.1:8098");
});

test("a Chrome internal page can be bookmarked", async ({ page }) => {
  await openWall(page, true, []);
  await page.getByRole("button", {name: "+ Lesezeichen"}).click();
  await page.getByLabel("Name").fill("Extensions");
  await page.getByLabel("Adresse").fill("chrome://extensions/");
  await page.getByRole("button", {name: "Anlegen", exact: true}).click();
  await expect(page.locator(".tile .title")).toHaveText("Extensions");
  await expect(page.locator(".tile")).toHaveAttribute("href", "chrome://extensions/");
});

test("a folder and a bookmark can be created while the wall stays flat", async ({ page }) => {
  await openWall(page, true, []);

  await page.getByRole("button", {name: "+ Ordner"}).click();
  await expect(page.getByLabel("Ordner")).toBeHidden();
  await page.getByLabel("Name").fill("Work");
  await page.getByRole("button", {name: "Anlegen", exact: true}).click();
  await expect(page.locator(".folder")).toHaveCount(0);

  await page.getByRole("button", {name: "+ Lesezeichen"}).click();
  await page.getByLabel("Name").fill("New site");
  await page.getByLabel("Adresse").fill("https://new.example/");
  await page.getByLabel("Ordner").selectOption({label: "Work"});
  await page.getByRole("button", {name: "Anlegen", exact: true}).click();

  await expect(page.locator(".tile .title")).toHaveText("New site");
  await expect(page.locator(".folder")).toHaveCount(0);
  const tree = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("die-wand.test.extension.tiles") || "[]"));
  expect(tree.find(tile => tile.guid.startsWith("folder-")).children[0].title).toBe("New site");
  await page.reload();
  await expect(page.locator(".tile .title")).toHaveText("New site");
});

test("a bookmark can be moved into a folder without showing the folder", async ({ page }) => {
  const tiles = [
    {title: "Diary", url: "https://diary.example/", guid: "diary-1"},
    {title: "Work", guid: "folder-1", children: []},
  ];
  await openWall(page, true, tiles);

  const first = page.locator(".tile-cell").first();
  await first.hover();
  await first.getByRole("button", {name: "Diary verschieben"}).click();
  await page.getByLabel("Ordner").selectOption({label: "Work"});
  await page.getByRole("button", {name: "Verschieben", exact: true}).click();

  await expect(page.locator(".tile .title")).toHaveText("Diary");
  await expect(page.locator(".folder")).toHaveCount(0);
  const tree = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("die-wand.test.extension.tiles") || "[]"));
  expect(tree.find(tile => tile.guid === "folder-1").children[0].guid).toBe("diary-1");
  await page.reload();
  await expect(page.locator(".tile .title")).toHaveText("Diary");
});

test("bookmarks inside folders are shown flat", async ({ page }) => {
  const tiles = [{title: "Work", guid: "folder-1", children: [
    {title: "Diary", url: "https://diary.example/", guid: "diary-1"},
    {title: "Nested", guid: "folder-2", children: [
      {title: "GNOME", url: "https://gnome.org/", guid: "gnome-1"},
    ]},
  ]}];
  await openWall(page, true, tiles);
  await expect(page.locator(".tile")).toHaveCount(2);
  await expect(page.locator(".folder")).toHaveCount(0);
  await expect(page.locator("#wall > .tile-cell")).toHaveCount(2);
});

test("a folder and its bookmarks can be deleted", async ({ page }) => {
  const tiles = [{title: "Work", guid: "folder-1", children: [
    {title: "Diary", url: "https://diary.example/", guid: "diary-1"},
  ]}];
  await openWall(page, true, tiles);
  page.on("dialog", dialog => dialog.accept());

  await page.getByRole("button", {name: "Ordner löschen"}).click();
  await page.getByLabel("Ordner").selectOption({label: "Work"});
  await page.locator("#dialog-submit").click();

  await expect(page.locator(".tile")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tile")).toHaveCount(0);
});

test("a known icon remains when the extension favicon is unavailable", async ({ page }) => {
  const icon = "https://icons.example/diary.png";
  await page.route(icon, route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
  await openWall(page, true, [
    {title: "Diary", url: "https://diary.example/", guid: "new-id", icon},
  ]);
  await expect(page.locator(".tile img")).toHaveAttribute("src", icon);
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
