// The only bridge from the web page to the extension. The ID is pinned by the
// public key in extension/manifest.json, so reinstalling does not change it.
export const EXTENSION_ID = 'clmgdglkngbijlkajfkfnaflmepfhbbp';

export function faviconUrl(url) {
    return `chrome-extension://${EXTENSION_ID}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

export function extensionCommand(message) {
    const api = globalThis.chrome?.runtime;
    if (!api?.sendMessage)
        return Promise.reject(new Error('die-wand extension not installed'));

    return new Promise((resolve, reject) => {
        try {
            api.sendMessage(EXTENSION_ID, message, response => {
                const error = api.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                if (!response?.ok) {
                    reject(new Error(response?.error ?? 'extension did not answer'));
                    return;
                }
                resolve(response);
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function extensionTree() {
    return extensionCommand({action: 'tree'});
}

export async function removeBookmark(guid, tile = {}) {
    return extensionCommand({
        action: 'remove', guid, url: tile.url, title: tile.title,
    });
}

export async function createBookmark({title, url, parentId}) {
    return extensionCommand({action: 'create', title, url, parentId});
}

export async function createFolder({title, parentId}) {
    return extensionCommand({action: 'createFolder', title, parentId});
}

export async function openBookmark(url) {
    return extensionCommand({action: 'open', url});
}

export async function updateBookmark(guid, {title, url, oldUrl, oldTitle}) {
    return extensionCommand({
        action: 'update', guid, title, url, oldUrl, oldTitle,
    });
}

export async function moveBookmark(guid, parentId, index) {
    return extensionCommand({action: 'move', guid, parentId, index});
}
