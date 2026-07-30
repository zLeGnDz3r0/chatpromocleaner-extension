const STORAGE_KEY = "promoCleanerEnabled";

const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");

function updateStatusLabel(enabled) {
  statusText.textContent = enabled ? "Activado" : "Desactivado";
  statusText.classList.toggle("is-off", !enabled);
}

async function getEnabled() {
  const result = await chrome.storage.sync.get({ [STORAGE_KEY]: true });
  return result[STORAGE_KEY] !== false;
}

async function setEnabled(enabled) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: enabled });

  const tabs = await chrome.tabs.query({ url: ["*://*.twitch.tv/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "TCPC_SET_ENABLED",
          enabled,
        });
      } catch {
        // Content script may not be injected yet on that tab
      }
    })
  );
}

async function init() {
  const enabled = await getEnabled();
  toggle.checked = enabled;
  updateStatusLabel(enabled);

  toggle.addEventListener("change", async () => {
    const next = toggle.checked;
    updateStatusLabel(next);
    await setEnabled(next);
  });
}

init();
