chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_SELECTED_TEXT") {
    return false;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      sendResponse({ ok: false, error: "No active tab found." });
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { type: "READ_SELECTION" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: "Couldn't read selected text from this page." });
        return;
      }

      sendResponse(response || { ok: false, error: "No text selected." });
    });
  });

  return true;
});
