import {dispatch} from './commands.js';

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  dispatch(message, chrome.bookmarks, sender.origin, chrome.tabs)
    .then(response => {
      if (message?.action === 'ping')
        response.version = chrome.runtime.getManifest().version;
      sendResponse(response);
    })
    .catch(error => sendResponse({ok: false, error: error.message}));
  // Chrome keeps the message channel open until sendResponse is called.
  return true;
});
