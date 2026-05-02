const draftInput = document.getElementById("draftInput");
const outputInput = document.getElementById("outputInput");
const improveButton = document.getElementById("improveButton");
const retryButton = document.getElementById("retryButton");
const copyButton = document.getElementById("copyButton");
const clearButton = document.getElementById("clearButton");
const useSelectionButton = document.getElementById("useSelectionButton");
const statusText = document.getElementById("statusText");
const toast = document.getElementById("toast");
const inputCount = document.getElementById("inputCount");

const STORAGE_KEYS = {
  draft: "sendable.lastDraft",
  output: "sendable.lastOutput"
};

function setStatus(message) {
  statusText.textContent = message;
}

function setToast(message) {
  toast.textContent = message;
}

function updateCharacterCount() {
  inputCount.textContent = `${draftInput.value.length} characters`;
}

function setLoading(isLoading) {
  improveButton.disabled = isLoading;
  retryButton.disabled = isLoading || !draftInput.value.trim();
  clearButton.disabled = isLoading || (!draftInput.value && !outputInput.value);
  useSelectionButton.disabled = isLoading;
  copyButton.disabled = isLoading || !outputInput.value.trim();
  improveButton.textContent = isLoading ? "Refining..." : "Improve text";
  setStatus(isLoading ? "Refining..." : outputInput.value ? "Refined version ready" : "Ready");
}

async function persistState() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.draft]: draftInput.value,
    [STORAGE_KEYS.output]: outputInput.value
  });
}

async function hydrateState() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.draft, STORAGE_KEYS.output]);
  draftInput.value = stored[STORAGE_KEYS.draft] || "";
  outputInput.value = stored[STORAGE_KEYS.output] || "";
  updateCharacterCount();
  setLoading(false);
}

function normalizeErrorMessage(error) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Something went wrong. Please try again.";
}

async function refineText() {
  const text = draftInput.value.trim();

  if (!text) {
    setToast("Enter or paste some text first.");
    setStatus("Waiting for your text");
    return;
  }

  if (!API_ENDPOINT || API_ENDPOINT.includes("your-deployment-url")) {
    setToast("Set your backend URL in extension/config.js first.");
    setStatus("Backend setup needed");
    return;
  }

  setToast("");
  setLoading(true);

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
      throw new Error(data.error || "Something went wrong. Please try again.");
    }

    outputInput.value = data.output || "";
    await persistState();
    setToast("Your refined version is ready.");
  } catch (error) {
    setToast(normalizeErrorMessage(error.message));
    setStatus("Something went wrong");
  } finally {
    setLoading(false);
    await persistState();
  }
}

async function copyOutput() {
  if (!outputInput.value.trim()) {
    setToast("Nothing to copy yet.");
    return;
  }

  await navigator.clipboard.writeText(outputInput.value);
  setToast("Copied to clipboard.");
}

async function clearAll() {
  draftInput.value = "";
  outputInput.value = "";
  setToast("");
  setStatus("Ready");
  updateCharacterCount();
  setLoading(false);
  await persistState();
}

async function useSelectedText() {
  setToast("");
  setStatus("Looking for selected text");

  const response = await chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" });

  if (!response?.ok || !response.text) {
    setToast(response?.error || "Select some text on the page first.");
    setStatus("Ready");
    return;
  }

  draftInput.value = response.text;
  outputInput.value = "";
  updateCharacterCount();
  setLoading(false);
  await persistState();
  setToast("Selected text added.");
}

draftInput.addEventListener("input", async () => {
  updateCharacterCount();
  retryButton.disabled = !draftInput.value.trim();
  await persistState();
});

improveButton.addEventListener("click", refineText);
retryButton.addEventListener("click", refineText);
copyButton.addEventListener("click", copyOutput);
clearButton.addEventListener("click", clearAll);
useSelectionButton.addEventListener("click", useSelectedText);

hydrateState();
