function readSelectionFromActiveElement() {
  const activeElement = document.activeElement;

  if (
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLInputElement &&
      ["text", "search", "email", "url"].includes(activeElement.type))
  ) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;

    if (start !== end) {
      return activeElement.value.slice(start, end).trim();
    }
  }

  if (activeElement?.isContentEditable) {
    return window.getSelection?.().toString().trim() || "";
  }

  return "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "READ_SELECTION") {
    return false;
  }

  const selection =
    readSelectionFromActiveElement() || window.getSelection?.().toString().trim() || "";

  sendResponse(
    selection
      ? { ok: true, text: selection }
      : { ok: false, error: "Select some text first." }
  );

  return false;
});
