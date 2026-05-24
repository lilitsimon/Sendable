function pickSelectionResult(results) {
  if (!Array.isArray(results)) {
    return "";
  }

  for (const entry of results) {
    if (typeof entry?.result === "string" && entry.result.trim()) {
      return entry.result.trim();
    }
  }

  return "";
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") {
    return;
  }

  chrome.tabs.create({
    url: chrome.runtime.getURL("welcome.html")
  });
});

function readSelectionInPage() {
  function getDeepActiveElement(root) {
    const activeElement = root?.activeElement;

    if (!activeElement) {
      return null;
    }

    if (activeElement.shadowRoot?.activeElement) {
      return getDeepActiveElement(activeElement.shadowRoot);
    }

    return activeElement;
  }

  function readSelectionFromElement(element) {
    if (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement &&
        ["text", "search", "email", "url"].includes(element.type))
    ) {
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? 0;

      if (start !== end) {
        return element.value.slice(start, end).trim();
      }
    }

    if (element?.isContentEditable) {
      return window.getSelection?.().toString().trim() || "";
    }

    return "";
  }

  const activeElement = getDeepActiveElement(document);

  return (
    readSelectionFromElement(activeElement) ||
    window.getSelection?.().toString().trim() ||
    document.getSelection?.().toString().trim() ||
    ""
  );
}

function readSelectionFromTab(tabId, sendResponse) {
  chrome.tabs.sendMessage(tabId, { type: "READ_SELECTION" }, (response) => {
    if (response?.ok && response.text) {
      sendResponse(response);
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        func: readSelectionInPage
      },
      (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: "We couldn't read the selected text on this page." });
          return;
        }

        const selection = pickSelectionResult(results);

        sendResponse(
          selection
            ? { ok: true, text: selection }
            : response || { ok: false, error: "Select the text you want to work on first." }
        );
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_SELECTED_TEXT") {
    return false;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      sendResponse({ ok: false, error: "Open the page with your text and try again." });
      return;
    }

    readSelectionFromTab(activeTab.id, sendResponse);
  });

  return true;
});
