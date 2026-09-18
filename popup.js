const PROMO_KEY = "promoCleanerEnabled";
const ADS_KEY = "chatAdsCleanerEnabled";

const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const adsToggle = document.getElementById("adsToggle");
const adsStatusText = document.getElementById("adsStatusText");

function updateStatusLabel(el, enabled) {
  el.textContent = enabled ? "Activado" : "Desactivado";
  el.classList.toggle("is-off", !enabled);
}

async function getPrefs() {
  const result = await chrome.storage.sync.get({
    [PROMO_KEY]: true,
    [ADS_KEY]: true,
  });
  return {
    promo: result[PROMO_KEY] !== false,
    ads: result[ADS_KEY] !== false,
  };
}

async function notifyTwitchTabs(type, enabled) {
  const tabs = await chrome.tabs.query({ url: ["*://*.twitch.tv/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type, enabled });
      } catch {
        // Content script may not be injected yet on that tab
      }
    })
  );
}

async function setPromoEnabled(enabled) {
  await chrome.storage.sync.set({ [PROMO_KEY]: enabled });
  await notifyTwitchTabs("TCPC_SET_ENABLED", enabled);
}

async function setAdsEnabled(enabled) {
  await chrome.storage.sync.set({ [ADS_KEY]: enabled });
  await notifyTwitchTabs("TCPC_SET_ADS_ENABLED", enabled);
}

async function init() {
  const prefs = await getPrefs();
  toggle.checked = prefs.promo;
  adsToggle.checked = prefs.ads;
  updateStatusLabel(statusText, prefs.promo);
  updateStatusLabel(adsStatusText, prefs.ads);

  toggle.addEventListener("change", async () => {
    const next = toggle.checked;
    updateStatusLabel(statusText, next);
    await setPromoEnabled(next);
  });

  adsToggle.addEventListener("change", async () => {
    const next = adsToggle.checked;
    updateStatusLabel(adsStatusText, next);
    await setAdsEnabled(next);
  });
}

init();
