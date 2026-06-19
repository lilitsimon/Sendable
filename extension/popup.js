const draftInput = document.getElementById("draftInput");
const improveButton = document.getElementById("improveButton");
const retryButton = document.getElementById("retryButton");
const copyButton = document.getElementById("copyButton");
const clearButton = document.getElementById("clearButton");
const useSelectionButton = document.getElementById("useSelectionButton");
const floatingControl = document.getElementById("floatingControl");
const floatingButtonToggle = document.getElementById("floatingButtonToggle");
const openPanelButton = document.getElementById("openPanelButton");
const appContent = document.getElementById("appContent");
const statusText = document.getElementById("statusText");
const toast = document.getElementById("toast");
const inputCount = document.getElementById("inputCount");
const suggestionCount = document.getElementById("suggestionCount");
const toneIndicators = document.getElementById("toneIndicators");
const refinedDisplay = document.getElementById("refinedDisplay");
const upgradeWall = document.getElementById("upgradeWall");
const previewSection = document.getElementById("previewSection");
const sectionDivider = document.getElementById("sectionDivider");
const editorSection = document.querySelector(".editor-section");
const heroSection = document.querySelector(".hero");
const checksRemaining = document.getElementById("checksRemaining");
const accountSection = document.getElementById("accountSection");
const COPY_BUTTON_LABEL = "Copy text";
const IMPROVE_BUTTON_LABEL = "Make it sendable";
const EMPTY_PREVIEW_LABEL = "Your sendable version will appear here.";
const FREE_DAILY_LIMIT = 10;
let copyFeedbackTimeoutId = null;

const STORAGE_KEYS = {
  currentText: "sendable.currentText",
  targetText: "sendable.targetText",
  floatingButtonVisible: "sendable.floatingButtonVisible",
  dailyCount: "sendable.dailyChecks.count",
  dailyDate: "sendable.dailyChecks.date",
  subscription: "sendable.subscription",
  sessionToken: "sendable.sessionToken"
};

const state = {
  currentText: "",
  targetText: "",
  isLoading: false,
  changeCount: 0,
  isFloatingButtonVisible: true,
  checksUsedToday: 0,
  isPro: false,
  isSignedIn: false,
  accountEmail: null,
  renewsAt: null
};

const isEmbeddedPanel = window.top !== window.self;

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function showUpgradeWall() {
  upgradeWall.hidden = false;
  previewSection.hidden = true;
  sectionDivider.hidden = true;
  editorSection.hidden = true;
  heroSection.hidden = true;
}

function hideUpgradeWall() {
  upgradeWall.hidden = true;
  previewSection.hidden = false;
  sectionDivider.hidden = false;
  editorSection.hidden = false;
  heroSection.hidden = false;
}

function updateChecksRemainingDisplay() {
  if (state.isPro || state.checksUsedToday === 0) {
    checksRemaining.textContent = "";
    return;
  }
  const left = FREE_DAILY_LIMIT - state.checksUsedToday;
  if (left > 0) {
    checksRemaining.textContent = `${left} free check${left === 1 ? "" : "s"} left today`;
  } else {
    checksRemaining.textContent = "";
  }
}

if (isEmbeddedPanel) {
  document.body.classList.add("embedded-panel");
}

function formatRenewalDate(isoString) {
  if (!isoString) return null;
  try {
    return new Date(isoString).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function renderAccountSection() {
  if (!accountSection || isEmbeddedPanel) return;

  if (!state.isSignedIn) {
    accountSection.innerHTML = `<a class="account-signin-link" href="https://makesendable.com/login" target="_blank" rel="noopener noreferrer">Sign in to activate Pro →</a>`;
    return;
  }

  const badge = state.isPro
    ? `<span class="account-pro-badge">Pro</span>`
    : `<span class="account-free-badge">Free</span>`;
  const email = state.accountEmail ? `<span class="account-email">${escapeHtml(state.accountEmail)}</span>` : "";

  if (state.isPro) {
    const renewalDate = formatRenewalDate(state.renewsAt);
    const renewalRow = renewalDate
      ? `<div class="account-sub-row"><span class="account-sub-label">Renews</span><span class="account-sub-value">${escapeHtml(renewalDate)}</span></div>`
      : "";

    accountSection.innerHTML = `
      <div class="account-card">
        <div class="account-row">
          <div class="account-info">${badge}${email}</div>
          <button class="account-signout-btn" id="accountSignOutBtn">Sign out</button>
        </div>
        ${renewalRow}
        <div class="account-manage-row">
          <a class="account-manage-link" href="https://makesendable.com/account" target="_blank" rel="noopener noreferrer">Manage subscription →</a>
        </div>
      </div>
    `;
  } else {
    accountSection.innerHTML = `
      <div class="account-row">
        <div class="account-info">${badge}${email}</div>
        <button class="account-signout-btn" id="accountSignOutBtn">Sign out</button>
      </div>
    `;
  }

  document.getElementById("accountSignOutBtn")?.addEventListener("click", signOut);
}

async function signOut() {
  await chrome.storage.local.remove([STORAGE_KEYS.sessionToken, STORAGE_KEYS.subscription]);
  state.isPro = false;
  state.isSignedIn = false;
  state.accountEmail = null;
  state.renewsAt = null;
  hideUpgradeWall();
  renderAccountSection();
  updateChecksRemainingDisplay();
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

async function persistState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.currentText]: state.currentText,
      [STORAGE_KEYS.targetText]: state.targetText
    });
  } catch (_error) {
    // storage failure is non-critical
  }
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

      return /\s+/u.test(operation.token)
        ? ""
        : `<span class="preview-token-removed">${safeToken}</span>`;
    })
    .join("");

  return { markup, changeCount };
}

function deriveToneIndicators(currentText, targetText, changeCount) {
  if (!targetText.trim() || changeCount === 0) {
    return [];
  }

  const indicators = [];
  const currentWords = (currentText.trim().match(/\S+/gu) || []).length;
  const targetWords = (targetText.trim().match(/\S+/gu) || []).length;
  const wordReduction = currentWords > 0 ? (currentWords - targetWords) / currentWords : 0;

  if (wordReduction > 0.1) {
    indicators.push("Tighter");
  }

  if (changeCount <= 3) {
    indicators.push("Corrected");
  } else if (changeCount >= 8) {
    indicators.push("Restructured");
  }

  if (indicators.length < 2) {
    indicators.push("More natural");
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
  updateChecksRemainingDisplay();
  renderAccountSection();
  setLoading(state.isLoading);
}

async function hydrateState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.currentText,
    STORAGE_KEYS.targetText,
    STORAGE_KEYS.floatingButtonVisible,
    STORAGE_KEYS.dailyCount,
    STORAGE_KEYS.dailyDate,
    STORAGE_KEYS.subscription,
    STORAGE_KEYS.sessionToken
  ]);

  state.currentText = stored[STORAGE_KEYS.currentText] || "";
  state.targetText = stored[STORAGE_KEYS.targetText] || "";
  state.isFloatingButtonVisible =
    typeof stored[STORAGE_KEYS.floatingButtonVisible] === "boolean"
      ? stored[STORAGE_KEYS.floatingButtonVisible]
      : true;

  state.isPro = stored[STORAGE_KEYS.subscription]?.isPro === true;
  state.isSignedIn = !!stored[STORAGE_KEYS.sessionToken];
  state.accountEmail = stored[STORAGE_KEYS.subscription]?.email ?? null;
  state.renewsAt = stored[STORAGE_KEYS.subscription]?.renewsAt ?? null;

  const storedDate = stored[STORAGE_KEYS.dailyDate];
  state.checksUsedToday = storedDate === getTodayString()
    ? (stored[STORAGE_KEYS.dailyCount] || 0)
    : 0;

  if (!state.isPro && state.checksUsedToday >= FREE_DAILY_LIMIT && state.currentText) {
    showUpgradeWall();
  }

  render();
}

async function refineText() {
  const text = draftInput.value.trim();

  if (!text) {
    setToast("Add a draft to get started.");
    setStatus("Paste a message or use selected text");
    return;
  }

  if (text.length < 10) {
    setToast("Your draft is too short to check. Add a bit more text.");
    return;
  }

  if (text.length > 12000) {
    setToast("That draft is too long. Try breaking it into shorter sections.");
    return;
  }

  if (!state.isPro && state.checksUsedToday >= FREE_DAILY_LIMIT) {
    showUpgradeWall();
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

    if (!state.isPro) {
      state.checksUsedToday += 1;
      await chrome.storage.local.set({
        [STORAGE_KEYS.dailyCount]: state.checksUsedToday,
        [STORAGE_KEYS.dailyDate]: getTodayString()
      });
      updateChecksRemainingDisplay();
    }
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
  hideUpgradeWall();
  render();
  await persistState();
}

async function useSelectedText() {
  setToast("");
  setStatus("Looking for selected text");

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" });
  } catch (_error) {
    setToast("Couldn't read selected text. Try again.");
    setStatus("");
    return;
  }

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

async function openFloatingPanel() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    setToast("Open a webpage first, then try again.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    window.close();
  } catch (_error) {
    setToast("Sendable can't open on this page.");
  }
}

draftInput.addEventListener("input", async () => {
  state.currentText = draftInput.value;
  updateCharacterCount();
  clearButton.disabled = state.isLoading || (!state.currentText && !state.targetText);
  retryButton.disabled = state.isLoading || !draftInput.value.trim();
  copyButton.disabled = state.isLoading || !(state.targetText.trim() || draftInput.value.trim());
  await persistState();
});

improveButton.addEventListener("click", refineText);
retryButton.addEventListener("click", refineText);
copyButton.addEventListener("click", copyRefinedText);
clearButton.addEventListener("click", clearAll);
useSelectionButton.addEventListener("click", useSelectedText);
floatingButtonToggle?.addEventListener("change", updateFloatingButtonVisibility);
openPanelButton?.addEventListener("click", openFloatingPanel);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[STORAGE_KEYS.subscription]) {
    const newSub = changes[STORAGE_KEYS.subscription].newValue;
    state.isPro = newSub?.isPro === true;
    state.accountEmail = newSub?.email ?? null;
    state.renewsAt = newSub?.renewsAt ?? null;
    if (state.isPro) hideUpgradeWall();
    renderAccountSection();
    updateChecksRemainingDisplay();
  }

  if (changes[STORAGE_KEYS.sessionToken]) {
    state.isSignedIn = !!changes[STORAGE_KEYS.sessionToken].newValue;
    renderAccountSection();
  }
});

hydrateState();
