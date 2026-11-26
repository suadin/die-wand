// A small Chrome extension stand-in for the browser tests. It keeps the tree
// in page memory, so a delete can be verified across a reload without touching
// the real Chrome profile.
export async function mockExtension(page, tiles) {
  await page.addInitScript(initial => {
    const key = 'die-wand.test.extension.tiles';
    const saved = sessionStorage.getItem(key);
    const state = {tiles: saved ? JSON.parse(saved) : structuredClone(initial)};

    const findByGuid = (list, guid) => {
      for (const tile of list) {
        if (tile.guid === guid) return tile;
        if (tile.children) {
          const found = findByGuid(tile.children, guid);
          if (found) return found;
        }
      }
      return null;
    };
    const findFolder = (list, guid) => {
      for (const tile of list) {
        if (tile.guid === guid && tile.children) return tile;
        if (tile.children) {
          const found = findFolder(tile.children, guid);
          if (found) return found;
        }
      }
      return null;
    };
    const locate = (list, guid) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].guid === guid) return {list, index: i};
        if (list[i].children) {
          const found = locate(list[i].children, guid);
          if (found) return found;
        }
      }
      return null;
    };
    const take = (list, guid) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].guid === guid) return list.splice(i, 1)[0];
        if (list[i].children) {
          const found = take(list[i].children, guid);
          if (found) return found;
        }
      }
      return null;
    };
    const findByUrl = (list, url, title) => {
      for (const tile of list) {
        if (tile.url === url && (!title || tile.title === title)) return tile;
        if (tile.children) {
          const found = findByUrl(tile.children, url, title);
          if (found) return found;
        }
      }
      return null;
    };
    const put = (tile, parentId, index) => {
      const folder = parentId === '1' ? null : findFolder(state.tiles, parentId);
      const list = folder ? folder.children : state.tiles;
      if (Number.isInteger(index)) list.splice(Math.min(index, list.length), 0, tile);
      else list.push(tile);
    };
    const annotate = (list, parentId = '1') => list.map((tile, index) => ({
      ...tile,
      parentId,
      index,
      siblingCount: list.length,
      ...(tile.children ? {children: annotate(tile.children, tile.guid)} : {}),
    }));
    const persist = () => sessionStorage.setItem(key, JSON.stringify(state.tiles));

    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage(id, message, callback) {
          if (id !== 'clmgdglkngbijlkajfkfnaflmepfhbbp') {
            this.lastError = {message: 'extension not found'};
            callback(undefined);
            return;
          }
          this.lastError = null;
          if (message.action === 'ping') {
            callback({ok: true, name: 'die-wand'});
          } else if (message.action === 'open') {
            sessionStorage.setItem('die-wand.test.opened', message.url);
            callback({ok: true, url: message.url});
          } else if (message.action === 'tree') {
            callback({ok: true, barId: '1', tiles: annotate(structuredClone(state.tiles))});
          } else if (message.action === 'remove') {
            let tile = take(state.tiles, message.guid);
            if (!tile && message.url)
              tile = findByUrl(state.tiles, message.url, message.title);
            if (!tile) {
              callback({ok: false, error: 'bookmark not found'});
              return;
            }
            take(state.tiles, tile.guid);
            persist();
            callback({ok: true, guid: tile.guid});
          } else if (message.action === 'create') {
            const guid = `created-${Date.now()}`;
            put({guid, title: message.title, url: message.url}, message.parentId || '1');
            persist();
            callback({ok: true, guid});
          } else if (message.action === 'createFolder') {
            const guid = `folder-${Date.now()}`;
            put({guid, title: message.title, children: []}, message.parentId || '1');
            persist();
            callback({ok: true, guid});
          } else if (message.action === 'update') {
            let tile = findByGuid(state.tiles, message.guid);
            if (!tile && message.oldUrl)
              tile = findByUrl(state.tiles, message.oldUrl, message.oldTitle);
            if (!tile) {
              callback({ok: false, error: 'bookmark not found'});
              return;
            }
            tile.title = message.title;
            tile.url = message.url;
            persist();
            callback({ok: true, guid: tile.guid});
          } else if (message.action === 'move') {
            const location = locate(state.tiles, message.guid);
            const tile = take(state.tiles, message.guid);
            if (!tile) {
              callback({ok: false, error: 'bookmark not found'});
              return;
            }
            const folder = message.parentId === '1' ? null
              : findFolder(state.tiles, message.parentId);
            const targetList = folder ? folder.children : state.tiles;
            let index = message.index;
            if (Number.isInteger(index) && location?.list === targetList
                && location.index < index)
              index -= 1;
            put(tile, message.parentId || '1', index);
            persist();
            callback({ok: true, guid: message.guid, parentId: message.parentId || '1'});
          } else {
            callback({ok: false, error: 'unknown action'});
          }
        },
      },
    };
  }, tiles);
}
