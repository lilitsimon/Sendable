let lastKnownSelection = "";

function isSupportedTextInput(element) {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      ["text", "search", "email", "url"].includes(element.type))
  );
}

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

function readSelectionFromActiveElement() {
  const activeElement = getDeepActiveElement(document);

  if (isSupportedTextInput(activeElement)) {
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

function readCurrentSelection() {
  return readSelectionFromActiveElement() || window.getSelection?.().toString().trim() || "";
}

function updateLastKnownSelection() {
  const selection = readCurrentSelection();

  if (selection) {
    lastKnownSelection = selection;
  }
}

document.addEventListener("selectionchange", updateLastKnownSelection, true);
document.addEventListener("mouseup", updateLastKnownSelection, true);
document.addEventListener("keyup", updateLastKnownSelection, true);
document.addEventListener("focusout", updateLastKnownSelection, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "READ_SELECTION") {
    const selection = readCurrentSelection() || lastKnownSelection;

    sendResponse(
      selection
        ? { ok: true, text: selection }
        : { ok: false, error: "Select the text you want to work on first." }
    );

    return false;
  }

  return false;
});
