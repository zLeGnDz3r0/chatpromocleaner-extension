const STORAGE_KEY = "promoCleanerEnabled";

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get({ [STORAGE_KEY]: true });
  if (current[STORAGE_KEY] === undefined) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: true });
  }
});
