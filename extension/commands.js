// The wall is a normal web page, so only these origins may send commands.
// The manifest repeats the list because Chrome checks it before this code runs.
export const ALLOWED_ORIGINS = Object.freeze([
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'https://192.168.178.50:8443',
]);

export function originAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

function cleanGuid(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && !/\s/.test(value) ? value : '';
}

function cleanTitle(value) {
  return (value ?? '').toString().trim().slice(0, 120);
}

function cleanUrl(value) {
  try {
    const url = new URL((value ?? '').toString().trim());
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'chrome:'
        ? url.href : '';
  } catch {
    return '';
  }
}

// Only the bookmark bar is the wall. Its numeric id is profile-dependent, so
// it is read from Chrome instead of assuming the usual "1".
async function bookmarkBar(bookmarks) {
  const [root] = await bookmarks.getTree();
  const bar = root?.children?.find(node => node.id === '1') ?? root?.children?.[0];
  if (!bar)
    throw new Error('bookmark bar not found');
  return bar;
}

function mapNode(node, parentId, index, siblingCount) {
  const tile = {
    title: (node.title ?? '').toString().slice(0, 120),
    guid: node.id,
    parentId,
    index,
    siblingCount,
  };
  if (node.url) {
    tile.url = node.url;
  } else {
    tile.children = (node.children ?? [])
      .map((child, childIndex) => mapNode(
        child, node.id, childIndex, (node.children ?? []).length));
  }
  return tile;
}

async function barTiles(bookmarks) {
  const bar = await bookmarkBar(bookmarks);
  return {
    ok: true,
    barId: bar.id,
    tiles: (bar.children ?? [])
      .map((node, index) => mapNode(node, bar.id, index, (bar.children ?? []).length)),
  };
}

function* walkNodes(nodes) {
  for (const node of nodes ?? []) {
    yield node;
    yield* walkNodes(node.children);
  }
}

async function findBookmark(bookmarks, rawUrl, title) {
  const url = cleanUrl(rawUrl);
  if (!url)
    return null;
  const [root] = await bookmarks.getTree();
  let matches = [...walkNodes(root?.children)]
    .filter(node => node.url && cleanUrl(node.url) === url);
  if (title)
    matches = matches.filter(node => node.title === title);
  return matches.length === 1 ? matches[0] : null;
}

/** One command per message. The page and the origin check stay the same for
 * reading, deleting, creating and moving bookmarks. */
export async function dispatch(message, bookmarks, origin, tabs = null) {
  if (!originAllowed(origin))
    return {ok: false, error: 'origin not allowed'};
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return {ok: false, error: 'invalid message'};

  switch (message.action) {
    case 'ping':
      return {ok: true, name: 'die-wand'};

    case 'open': {
      const url = cleanUrl(message.url);
      if (!url?.startsWith('chrome:') || !tabs?.create)
        return {ok: false, error: 'Chrome URL required'};
      await tabs.create({url});
      return {ok: true, url};
    }

    case 'tree':
      return await barTiles(bookmarks);

    case 'remove': {
      let guid = cleanGuid(message.guid);
      if (guid) {
        try {
          await bookmarks.get(guid);
        } catch {
          guid = '';
        }
      }
      if (!guid && message.url) {
        const match = await findBookmark(bookmarks, message.url, message.title);
        guid = match?.id ?? '';
        if (!guid)
          return {ok: false, error: 'bookmark not found or ambiguous'};
      }
      if (!guid)
        return {ok: false, error: 'guid missing'};
      await bookmarks.remove(guid);
      return {ok: true, guid};
    }

    case 'create': {
      const title = cleanTitle(message.title);
      const url = cleanUrl(message.url);
      const parentId = cleanGuid(message.parentId) || (await bookmarkBar(bookmarks)).id;
      if (!title || !url)
        return {ok: false, error: 'title and url required'};
      const created = await bookmarks.create({parentId, title, url});
      return {ok: true, guid: created.id};
    }

    case 'createFolder': {
      const title = cleanTitle(message.title);
      const parentId = cleanGuid(message.parentId) || (await bookmarkBar(bookmarks)).id;
      if (!title)
        return {ok: false, error: 'title required'};
      const created = await bookmarks.create({parentId, title});
      return {ok: true, guid: created.id};
    }

    case 'update': {
      let guid = cleanGuid(message.guid);
      if (guid) {
        try {
          await bookmarks.get(guid);
        } catch {
          guid = '';
        }
      }
      if (!guid && message.oldUrl) {
        const match = await findBookmark(bookmarks, message.oldUrl, message.oldTitle);
        guid = match?.id ?? '';
      }
      const title = cleanTitle(message.title);
      const url = cleanUrl(message.url);
      if (!guid || !title || !url)
        return {ok: false, error: 'bookmark, title and url required'};
      await bookmarks.update(guid, {title, url});
      return {ok: true, guid};
    }

    case 'move': {
      const guid = cleanGuid(message.guid);
      const parentId = cleanGuid(message.parentId) || (await bookmarkBar(bookmarks)).id;
      if (!guid)
        return {ok: false, error: 'guid missing'};
      const index = Number.isInteger(message.index) && message.index >= 0
        ? message.index : undefined;
      await bookmarks.move(guid, {parentId, ...(index === undefined ? {} : {index})});
      return {ok: true, guid, parentId};
    }

    default:
      return {ok: false, error: 'unknown action'};
  }
}
