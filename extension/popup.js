const draftInput = document.getElementById("draftInput");
const improveButton = document.getElementById("improveButton");
const retryButton = document.getElementById("retryButton");
const copyButton = document.getElementById("copyButton");
const clearButton = document.getElementById("clearButton");
const useSelectionButton = document.getElementById("useSelectionButton");
const floatingControl = document.getElementById("floatingControl");
const floatingButtonToggle = document.getElementById("floatingButtonToggle");
const appContent = document.getElementById("appContent");
const statusText = document.getElementById("statusText");
const toast = document.getElementById("toast");
const inputCount = document.getElementById("inputCount");
const suggestionCount = document.getElementById("suggestionCount");
const toneIndicators = document.getElementById("toneIndicators");
const refinedDisplay = document.getElementById("refinedDisplay");
const COPY_BUTTON_LABEL = "Copy text";
const IMPROVE_BUTTON_LABEL = "Make it sendable";
const EMPTY_PREVIEW_LABEL = "Your sendable version will appear here.";
let copyFeedbackTimeoutId = null;

const STORAGE_KEYS = {
  currentText: "sendable.currentText",
  targetText: "sendable.targetText",
  floatingButtonVisible: "sendable.floatingButtonVisible"
};

const state = {
  currentText: "",
  targetText: "",
  isLoading: false,
  changeCount: 0,
  isFloatingButtonVisible: true
};

const isEmbeddedPanel = window.top !== window.self;

if (isEmbeddedPanel) {
  document.body.classList.add("embedded-panel");
}

function setStatus(message) {
  statusText.textContent = message;
}

function setToast(message) {
  toast.textContent = message;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tokenizeText(text) {
  return text.match(/(\s+|[^\s\p{L}\p{N}_]+|[\p{L}\p{N}_]+)/gu) || [];
}

function countWords(text) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function updateCharacterCount() {
  const characters = draftInput.value.length;
  const words = countWords(draftInput.value);
  inputCount.textContent = `${characters} characters • ${words} words`;
}

function persistState() {
  return chrome.storage.local.set({
    [STORAGE_KEYS.currentText]: state.currentText,
    [STORAGE_KEYS.targetText]: state.targetText
  });
}

function normalizeErrorMessage(error) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Something went off track. Please try again.";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    const selection = window.getSelection();
    const activeElement = document.activeElement;
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.setAttribute("aria-hidden", "true");
    helper.style.position = "fixed";
    helper.style.top = "-1000px";
    helper.style.left = "-1000px";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);

    let succeeded = false;

    try {
      succeeded = document.execCommand("copy");
    } catch (_legacyError) {
      succeeded = false;
    }

    helper.remove();

    if (activeElement instanceof HTMLElement) {
      activeElement.focus();
    }

    selection?.removeAllRanges();

    if (!succeeded) {
      throw new Error("Copy failed");
    }

    return true;
  }
}

function buildLcsRows(sourceTokens, targetTokens) {
  const rows = Array.from({ length: sourceTokens.length + 1 }, () =>
    Array(targetTokens.length + 1).fill(0)
  );

  for (let sourceIndex = sourceTokens.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = targetTokens.length - 1; targetIndex >= 0; targetIndex -= 1) {
      rows[sourceIndex][targetIndex] =
        sourceTokens[sourceIndex] === targetTokens[targetIndex]
          ? rows[sourceIndex + 1][targetIndex + 1] + 1
          : Math.max(rows[sourceIndex + 1][targetIndex], rows[sourceIndex][targetIndex + 1]);
    }
  }

  return rows;
}

function buildDiffOperations(sourceTokens, targetTokens) {
  const rows = buildLcsRows(sourceTokens, targetTokens);
  const operations = [];
  let sourceIndex = 0;
  let targetIndex = 0;

  while (sourceIndex < sourceTokens.length && targetIndex < targetTokens.length) {
    if (sourceTokens[sourceIndex] === targetTokens[targetIndex]) {
      operations.push({ type: "same", token: sourceTokens[sourceIndex] });
      sourceIndex += 1;
      targetIndex += 1;
      continue;
    }

    if (rows[sourceIndex][targetIndex + 1] >= rows[sourceIndex + 1][targetIndex]) {
      operations.push({ type: "add", token: targetTokens[targetIndex] });
      targetIndex += 1;
      continue;
    }

    operations.push({ type: "remove", token: sourceTokens[sourceIndex] });
    sourceIndex += 1;
  }

  while (sourceIndex < sourceTokens.length) {
    operations.push({ type: "remove", token: sourceTokens[sourceIndex] });
    sourceIndex += 1;
  }

  while (targetIndex < targetTokens.length) {
    operations.push({ type: "add", token: targetTokens[targetIndex] });
    targetIndex += 1;
  }

  return operations;
}

function summarizeChanges(currentText, targetText) {
  const currentTokens = tokenizeText(currentText);
  const targetTokens = tokenizeText(targetText);
  const operations = buildDiffOperations(currentTokens, targetTokens);

  let changeCount = 0;
  let inChange = false;

  const markup = operations
    .map((operation) => {
      const safeToken = escapeHtml(operation.token);

      if (operation.type === "same") {
        inChange = false;
        return safeToken;
      }

      if (!inChange) {
        changeCount += 1;
        inChange = true;
      }

      if (operation.type === "add") {
        return /\s+/u.test(operation.token)
          ? safeToken
          : `<span class="preview-token">${safeToken}</span>`;
      }

      return "";
    })
    .join("");

  return { markup, changeCount };
}

function deriveToneIndicators(currentText, targetText, changeCount) {
  if (!targetText.trim() || changeCount === 0) {
    return [];
  }

  const indicators = [];
  const currentLength = currentText.trim().length;
  const targetLength = targetText.trim().length;

  if (targetLength < currentLength - 12) {
    indicators.push("Tighter");
  }

  if (/[.!?,:;]/u.test(targetText) && targetText !== currentText) {
    indicators.push("Clearer");
  }

  if (indicators.length < 3) {
    indicators.unshift("More natural");
  }

  return indicators.slice(0, 3);
}

function getSuggestionCountLabel(targetText, changeCount) {
  if (!targetText.trim()) {
    return "0 changes";
  }

  if (changeCount === 0) {
    return "Looks ready to send";
  }

  if (changeCount <= 2) {
    return `${changeCount} small ${changeCount === 1 ? "fix" : "fixes"}`;
  }

  if (changeCount <= 4) {
    return `${changeCount} improvement${changeCount === 1 ? "" : "s"}`;
  }

  return `${changeCount} changes made`;
}

function renderToneIndicators() {
  const indicators = deriveToneIndicators(state.currentText, state.targetText, state.changeCount);

  if (indicators.length === 0) {
    toneIndicators.innerHTML = "";
    return;
  }

  toneIndicators.innerHTML = indicators
    .map((label) => `<span class="tone-chip">${escapeHtml(label)}</span>`)
    .join("");
}

function renderRefinedDisplay() {
  if (!state.targetText.trim()) {
    refinedDisplay.textContent = EMPTY_PREVIEW_LABEL;
    refinedDisplay.classList.remove("is-clear");
    refinedDisplay.classList.add("is-empty");
    state.changeCount = 0;
    return;
  }

  const { markup, changeCount } = summarizeChanges(state.currentText, state.targetText);
  state.changeCount = changeCount;

  refinedDisplay.classList.remove("is-empty");

  if (changeCount === 0) {
    refinedDisplay.textContent = "Looks ready to send";
    refinedDisplay.classList.add("is-clear");
    return;
  }

  refinedDisplay.classList.remove("is-clear");

  if (!markup) {
    refinedDisplay.textContent = state.targetText;
  } else {
    refinedDisplay.innerHTML = markup;
  }
}

function resetCopyFeedback() {
  copyButton.classList.remove("is-success");
  copyButton.textContent = COPY_BUTTON_LABEL;
}

function showCopyFeedback(message) {
  window.clearTimeout(copyFeedbackTimeoutId);
  copyButton.classList.add("is-success");
  copyButton.textContent = "Copied";
  setToast(message);
  copyFeedbackTimeoutId = window.setTimeout(() => {
    resetCopyFeedback();
  }, 1400);
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  improveButton.disabled = isLoading;
  retryButton.disabled = isLoading || !draftInput.value.trim();
  clearButton.disabled = isLoading || (!state.currentText && !state.targetText);
  useSelectionButton.disabled = isLoading;
  copyButton.disabled = isLoading || !(state.targetText.trim() || draftInput.value.trim());
  improveButton.textContent = isLoading ? "Checking your wording..." : IMPROVE_BUTTON_LABEL;
  if (isLoading) {
    resetCopyFeedback();
  }

  if (isLoading) {
    setStatus("Keeping your meaning, tightening the wording");
    return;
  }

  if (!state.targetText.trim()) {
    setStatus("");
    return;
  }

  if (state.changeCount === 0) {
    setStatus("");
    return;
  }

  setStatus("");
}

function render() {
  appContent.hidden = !isEmbeddedPanel;

  if (draftInput.value !== state.currentText) {
    draftInput.value = state.currentText;
  }

  floatingControl.hidden = isEmbeddedPanel;
  floatingButtonToggle.checked = state.isFloatingButtonVisible;
  updateCharacterCount();
  renderRefinedDisplay();
  renderToneIndicators();
  suggestionCount.textContent = getSuggestionCountLabel(state.targetText, state.changeCount);
  setLoading(state.isLoading);
}

async function hydrateState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.currentText,
    STORAGE_KEYS.targetText,
    STORAGE_KEYS.floatingButtonVisible
  ]);

  state.currentText = stored[STORAGE_KEYS.currentText] || "";
  state.targetText = stored[STORAGE_KEYS.targetText] || "";
  state.isFloatingButtonVisible =
    typeof stored[STORAGE_KEYS.floatingButtonVisible] === "boolean"
      ? stored[STORAGE_KEYS.floatingButtonVisible]
      : true;

  render();
}

async function refineText() {
  const text = draftInput.value.trim();

  if (!text) {
    setToast("Add a draft to get started.");
    setStatus("Paste a message or use selected text");
    return;
  }

  if (!API_ENDPOINT || API_ENDPOINT.includes("your-deployment-url")) {
    setToast("Add your Sendable API URL in extension/config.js first.");
    setStatus("Setup needed");
    return;
  }

  state.currentText = draftInput.value;
  state.targetText = "";
  state.changeCount = 0;
  setToast("");
  setLoading(true);
  renderRefinedDisplay();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        mode: "professional_text_refine_v1"
      })
    });

    let data = {};

    try {
      data = await response.json();
    } catch (_error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || "Something went off track. Please try again.");
    }

    state.targetText = data.output || "";
    setToast("A few refinements, same meaning.");
  } catch (error) {
    setToast(normalizeErrorMessage(error.message));
    setStatus("Couldn’t review this draft");
  } finally {
    setLoading(false);
    render();
    await persistState();
  }
}

async function copyRefinedText() {
  const text = state.targetText.trim() ? state.targetText : draftInput.value.trim();

  if (!text) {
    setToast("Nothing to copy yet.");
    return;
  }

  try {
    await copyText(state.targetText.trim() ? state.targetText : draftInput.value);
    showCopyFeedback(
      state.targetText.trim() ? "Suggested version copied." : "Draft copied."
    );
  } catch (_error) {
    setToast("Couldn’t copy that. Please try again.");
    resetCopyFeedback();
  }
}

async function clearAll() {
  state.currentText = "";
  state.targetText = "";
  state.changeCount = 0;
  setToast("");
  setStatus("");
  render();
  await persistState();
}

async function useSelectedText() {
  setToast("");
  setStatus("Looking for selected text");

  const response = await chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" });

  if (!response?.ok || !response.text) {
    setToast(response?.error || "Select the text you want to work on first.");
    setStatus("");
    return;
  }

  state.currentText = response.text;
  state.targetText = "";
  state.changeCount = 0;
  render();
  await persistState();
  setToast("Selected text added.");
}

async function updateFloatingButtonVisibility() {
  state.isFloatingButtonVisible = floatingButtonToggle.checked;
  render();
  await chrome.storage.local.set({
    [STORAGE_KEYS.floatingButtonVisible]: state.isFloatingButtonVisible
  });
  setToast(
    state.isFloatingButtonVisible
      ? "Floating button turned back on."
      : "Floating button hidden. You can bring it back here anytime."
  );
}

draftInput.addEventListener("input", async () => {
  state.currentText = draftInput.value;
  render();
  await persistState();
});

improveButton.addEventListener("click", refineText);
retryButton.addEventListener("click", refineText);
copyButton.addEventListener("click", copyRefinedText);
clearButton.addEventListener("click", clearAll);
useSelectionButton.addEventListener("click", useSelectedText);
floatingButtonToggle?.addEventListener("change", updateFloatingButtonVisibility);

hydrateState();
