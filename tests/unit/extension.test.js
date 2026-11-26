import {describe, expect, it, vi} from 'vitest';

import {dispatch, originAllowed} from '../../extension/commands.js';

const ORIGIN = 'https://192.168.178.50:8443';

function bookmarks() {
    return {
        getTree: vi.fn(async () => [{
            id: '0',
            children: [
                {id: '1', title: 'Bookmarks bar', children: [
                    {id: 'link-1', title: 'Diary', url: 'https://diary.example/'},
                    {id: 'folder-1', title: 'Tech', children: [
                        {id: 'link-2', title: 'GNOME', url: 'https://gnome.org/'},
                    ]},
                ]},
                {id: '2', title: 'Other bookmarks', children: [
                    {id: 'other-1', title: 'Other', url: 'https://other.example/'},
                ]},
            ],
        }]),
        remove: vi.fn(async () => {}),
        get: vi.fn(async id => {
            if (!['link-1', 'link-2', 'folder-1'].includes(id))
                throw new Error('Bookmark id is invalid.');
            return {id};
        }),
        create: vi.fn(async bookmark => ({id: 'created-1'})),
        update: vi.fn(async () => {}),
        move: vi.fn(async () => {}),
    };
}

describe('extension commands', () => {
    it('allows only the configured wall origins', () => {
        expect(originAllowed(ORIGIN)).toBe(true);
        expect(originAllowed('http://127.0.0.1:8080')).toBe(true);
        expect(originAllowed('https://example.com')).toBe(false);
    });

    it('answers ping', async () => {
        const result = await dispatch({action: 'ping'}, bookmarks(), ORIGIN);
        expect(result).toEqual({ok: true, name: 'die-wand'});
    });

    it('uses the real bookmark bar id when it is not 1', async () => {
        const api = bookmarks();
        api.getTree.mockResolvedValue([{id: '0', children: [
            {id: '79', title: 'Bookmarks bar', children: [
                {id: 'link-1', title: 'Diary', url: 'https://diary.example/'},
            ]},
        ]}]);
        const result = await dispatch({action: 'tree'}, api, ORIGIN);
        expect(result.barId).toBe('79');
        expect(result.tiles[0].parentId).toBe('79');
    });

    it('opens a Chrome internal page through the extension', async () => {
        const tabs = {create: vi.fn(async () => {})};
        const result = await dispatch(
            {action: 'open', url: 'chrome://extensions/'}, bookmarks(), ORIGIN, tabs);
        expect(result).toEqual({ok: true, url: 'chrome://extensions/'});
        expect(tabs.create).toHaveBeenCalledWith({url: 'chrome://extensions/'});
    });

    it('does not open ordinary URLs through the Chrome-only command', async () => {
        const tabs = {create: vi.fn(async () => {})};
        expect(await dispatch(
            {action: 'open', url: 'https://example.com/'}, bookmarks(), ORIGIN, tabs))
            .toEqual({ok: false, error: 'Chrome URL required'});
        expect(tabs.create).not.toHaveBeenCalled();
    });

    it('returns only the bookmark bar with stable ids', async () => {
        const result = await dispatch({action: 'tree'}, bookmarks(), ORIGIN);
        expect(result.ok).toBe(true);
        expect(result.barId).toBe('1');
        expect(result.tiles).toEqual([
            {title: 'Diary', guid: 'link-1', url: 'https://diary.example/',
                parentId: '1', index: 0, siblingCount: 2},
            {title: 'Tech', guid: 'folder-1', parentId: '1', index: 1, siblingCount: 2,
                children: [
                    {title: 'GNOME', guid: 'link-2', url: 'https://gnome.org/',
                        parentId: 'folder-1', index: 0, siblingCount: 1},
                ]},
        ]);
    });

    it('removes exactly the requested bookmark', async () => {
        const api = bookmarks();
        const result = await dispatch({action: 'remove', guid: 'link-1'}, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'link-1'});
        expect(api.remove).toHaveBeenCalledWith('link-1');
    });

    it('falls back to URL and title when a tile id is stale', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'remove', guid: 'old-id', url: 'https://diary.example/', title: 'Diary',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'link-1'});
        expect(api.remove).toHaveBeenCalledWith('link-1');
    });

    it('does not guess when the URL is unknown', async () => {
        const api = bookmarks();
        expect(await dispatch({
            action: 'remove', guid: 'old-id', url: 'https://missing.example/', title: 'Missing',
        }, api, ORIGIN)).toEqual({ok: false, error: 'bookmark not found or ambiguous'});
        expect(api.remove).not.toHaveBeenCalled();
    });

    it('rejects a missing or malformed id', async () => {
        const api = bookmarks();
        expect(await dispatch({action: 'remove'}, api, ORIGIN))
            .toEqual({ok: false, error: 'guid missing'});
        expect(await dispatch({action: 'remove', guid: 'bad id'}, api, ORIGIN))
            .toEqual({ok: false, error: 'guid missing'});
        expect(api.remove).not.toHaveBeenCalled();
    });

    it('does not touch bookmarks from another origin', async () => {
        const api = bookmarks();
        const result = await dispatch(
            {action: 'remove', guid: 'link-1'}, api, 'https://example.com');
        expect(result).toEqual({ok: false, error: 'origin not allowed'});
        expect(api.remove).not.toHaveBeenCalled();
        expect(api.getTree).not.toHaveBeenCalled();
    });

    it('rejects unknown actions', async () => {
        expect(await dispatch({action: 'delete-everything'}, bookmarks(), ORIGIN))
            .toEqual({ok: false, error: 'unknown action'});
    });

    it('creates in the real bookmark bar when no parent is supplied', async () => {
        const api = bookmarks();
        api.getTree.mockResolvedValue([{id: '0', children: [
            {id: '79', title: 'Bookmarks bar', children: []},
        ]}]);
        await dispatch({action: 'createFolder', title: 'New'}, api, ORIGIN);
        expect(api.create).toHaveBeenCalledWith({parentId: '79', title: 'New'});
    });

    it('creates a bookmark in the selected folder', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'create', title: 'New site', url: 'https://new.example/', parentId: 'folder-1',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'created-1'});
        expect(api.create).toHaveBeenCalledWith({
            parentId: 'folder-1', title: 'New site', url: 'https://new.example/',
        });
    });

    it('allows a Chrome internal bookmark', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'create', title: 'Extensions', url: 'chrome://extensions/', parentId: '1',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'created-1'});
        expect(api.create).toHaveBeenCalledWith({
            parentId: '1', title: 'Extensions', url: 'chrome://extensions/',
        });
    });

    it('rejects an invalid bookmark address', async () => {
        const api = bookmarks();
        expect(await dispatch({
            action: 'create', title: 'Bad', url: 'javascript:alert(1)', parentId: '1',
        }, api, ORIGIN)).toEqual({ok: false, error: 'title and url required'});
        expect(api.create).not.toHaveBeenCalled();
    });

    it('creates a folder', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'createFolder', title: 'New folder', parentId: '1',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'created-1'});
        expect(api.create).toHaveBeenCalledWith({parentId: '1', title: 'New folder'});
    });

    it('updates the title and address of a bookmark', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'update', guid: 'link-1', title: 'Renamed', url: 'https://new.example/',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'link-1'});
        expect(api.update).toHaveBeenCalledWith('link-1', {
            title: 'Renamed', url: 'https://new.example/',
        });
    });

    it('finds the live id when an edited tile has a stale id', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'update', guid: 'old-id', title: 'Renamed', url: 'https://new.example/',
            oldUrl: 'https://diary.example/', oldTitle: 'Diary',
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'link-1'});
        expect(api.update).toHaveBeenCalledWith('link-1', {
            title: 'Renamed', url: 'https://new.example/',
        });
    });

    it('moves a bookmark into another folder', async () => {
        const api = bookmarks();
        const result = await dispatch({
            action: 'move', guid: 'link-1', parentId: 'folder-1', index: 0,
        }, api, ORIGIN);
        expect(result).toEqual({ok: true, guid: 'link-1', parentId: 'folder-1'});
        expect(api.move).toHaveBeenCalledWith('link-1', {parentId: 'folder-1', index: 0});
    });
});
