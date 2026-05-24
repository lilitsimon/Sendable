if (window.top === window.self && !document.getElementById("sendable-floating-root")) {
  const STORAGE_KEYS = {
    buttonPosition: "sendable.floatingButtonPosition",
    buttonVisible: "sendable.floatingButtonVisible"
  };

  const root = document.createElement("div");
  root.id = "sendable-floating-root";

  const openButton = document.createElement("button");
  openButton.id = "sendable-floating-button";
  openButton.type = "button";
  openButton.setAttribute("aria-label", "Open Sendable");
  openButton.classList.add("is-hidden");
  openButton.innerHTML = `
    <img
      class="sendable-button-icon"
      src="${chrome.runtime.getURL("icons/sendable-icon-512.png")}"
      alt=""
      aria-hidden="true"
    />
  `;

  const panel = document.createElement("section");
  panel.id = "sendable-floating-panel";
  panel.setAttribute("aria-label", "Sendable floating panel");

  const header = document.createElement("header");
  header.id = "sendable-floating-panel-header";

  const brandWrap = document.createElement("div");
  brandWrap.id = "sendable-floating-panel-brand";

  const brandIcon = document.createElement("img");
  brandIcon.id = "sendable-floating-panel-brand-icon";
  brandIcon.src = chrome.runtime.getURL("icons/sendable-icon-128.png");
  brandIcon.alt = "";
  brandIcon.setAttribute("aria-hidden", "true");

  const titleWrap = document.createElement("div");

  const title = document.createElement("div");
  title.id = "sendable-floating-panel-title";
  title.textContent = "Sendable";

  const subtitle = document.createElement("div");
  subtitle.id = "sendable-floating-panel-subtitle";
  subtitle.textContent = "Your words, just clearer.";

  const closeButton = document.createElement("button");
  closeButton.id = "sendable-floating-panel-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Minimize Sendable");
  closeButton.innerHTML =
    '<span class="sendable-minimize-icon" aria-hidden="true"></span>';

  const frame = document.createElement("iframe");
  frame.id = "sendable-floating-panel-frame";
  frame.src = chrome.runtime.getURL("popup.html");
  frame.setAttribute("title", "Sendable");

  titleWrap.append(title, subtitle);
  brandWrap.append(brandIcon, titleWrap);
  header.append(brandWrap, closeButton);
  panel.append(header, frame);
  root.append(openButton, panel);
  document.documentElement.append(root);

  let isOpen = false;
  let panelDragState = null;
  let buttonDragState = null;
  let didDragButton = false;
  let buttonPointerId = null;
  let isButtonVisible = true;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function persistButtonPosition(left, top) {
    chrome.storage.local.set({
      [STORAGE_KEYS.buttonPosition]: { left, top }
    });
  }

  function setOpen(nextOpen) {
    if (nextOpen && !isButtonVisible) {
      return;
    }

    isOpen = nextOpen;
    panel.classList.toggle("is-open", isOpen);
    openButton.classList.toggle("is-hidden", isOpen || !isButtonVisible);
  }

  function setButtonVisibility(nextVisible) {
    isButtonVisible = nextVisible;

    if (!isButtonVisible) {
      setOpen(false);
      openButton.classList.add("is-hidden");
      return;
    }

    openButton.classList.toggle("is-hidden", isOpen);
  }

  function getButtonBounds() {
    const buttonRect = openButton.getBoundingClientRect();

    return {
      maxLeft: Math.max(12, window.innerWidth - buttonRect.width - 12),
      maxTop: Math.max(12, window.innerHeight - buttonRect.height - 12)
    };
  }

  function applyButtonPosition(left, top) {
    const bounds = getButtonBounds();
    const nextLeft = clamp(left, 12, bounds.maxLeft);
    const nextTop = clamp(top, 12, bounds.maxTop);
    openButton.style.left = `${nextLeft}px`;
    openButton.style.top = `${nextTop}px`;
    openButton.style.right = "auto";
    openButton.style.bottom = "auto";

    return {
      left: nextLeft,
      top: nextTop
    };
  }

  function getButtonPosition() {
    const rect = openButton.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top
    };
  }

  function getBoundedPosition(left, top) {
    const panelRect = panel.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - panelRect.width - 12);
    const maxTop = Math.max(12, window.innerHeight - panelRect.height - 12);

    return {
      left: clamp(left, 12, maxLeft),
      top: clamp(top, 12, maxTop)
    };
  }

  function applyPosition(left, top) {
    const next = getBoundedPosition(left, top);
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.style.right = "auto";
  }

  function openPanel() {
    setOpen(true);

    if (!panel.style.left && !panel.style.top) {
      const rect = panel.getBoundingClientRect();
      const buttonRect = openButton.getBoundingClientRect();
      const suggestedLeft = buttonRect.right - rect.width - 8;
      const suggestedTop = buttonRect.top - rect.height / 2 + buttonRect.height / 2;

      applyPosition(suggestedLeft, suggestedTop);
    }
  }

  function minimizePanel() {
    setOpen(false);
  }

  function onPointerMove(event) {
    if (panelDragState) {
      event.preventDefault();

      applyPosition(
        panelDragState.startLeft + (event.clientX - panelDragState.startX),
        panelDragState.startTop + (event.clientY - panelDragState.startY)
      );
    }

    if (buttonDragState) {
      event.preventDefault();

      const nextLeft = buttonDragState.startLeft + (event.clientX - buttonDragState.startX);
      const nextTop = buttonDragState.startTop + (event.clientY - buttonDragState.startY);

      if (
        !didDragButton &&
        Math.hypot(event.clientX - buttonDragState.startX, event.clientY - buttonDragState.startY) > 4
      ) {
        didDragButton = true;
        openButton.classList.add("is-dragging");
      }

      applyButtonPosition(nextLeft, nextTop);
    }
  }

  function onPointerUp(event) {
    if (panelDragState) {
      header.classList.remove("is-dragging");
      panelDragState = null;
    }

    if (buttonDragState) {
      if (buttonPointerId !== null && openButton.hasPointerCapture?.(buttonPointerId)) {
        openButton.releasePointerCapture(buttonPointerId);
      }

      openButton.classList.remove("is-dragging");
      const buttonPosition = getButtonPosition();
      persistButtonPosition(buttonPosition.left, buttonPosition.top);
      buttonDragState = null;
      buttonPointerId = null;
      window.setTimeout(() => {
        didDragButton = false;
      }, 0);
    }
  }

  function onGlobalPointerDown(event) {
    if (!isOpen || panelDragState || buttonDragState) {
      return;
    }

    const eventPath = event.composedPath?.() || [];

    if (eventPath.includes(panel) || eventPath.includes(openButton)) {
      return;
    }

    minimizePanel();
  }

  openButton.addEventListener("click", () => {
    if (!didDragButton) {
      openPanel();
    }
  });
  closeButton.addEventListener("click", minimizePanel);

  openButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    const rect = openButton.getBoundingClientRect();

    buttonDragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };

    buttonPointerId = event.pointerId;
    openButton.setPointerCapture?.(event.pointerId);
    didDragButton = false;
  });

  header.addEventListener("pointerdown", (event) => {
    if (event.target === closeButton) {
      return;
    }

    const rect = panel.getBoundingClientRect();

    panelDragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };

    header.classList.add("is-dragging");
  });

  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("pointerdown", onGlobalPointerDown, true);
  window.addEventListener("blur", onPointerUp);
  window.addEventListener("resize", () => {
    const buttonPosition = getButtonPosition();
    const nextButtonPosition = applyButtonPosition(buttonPosition.left, buttonPosition.top);
    persistButtonPosition(nextButtonPosition.left, nextButtonPosition.top);

    if (isOpen && panel.style.left && panel.style.top) {
      applyPosition(parseFloat(panel.style.left), parseFloat(panel.style.top));
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.buttonVisible]) {
      setButtonVisibility(changes[STORAGE_KEYS.buttonVisible].newValue !== false);
    }
  });

  chrome.storage.local.get([STORAGE_KEYS.buttonPosition, STORAGE_KEYS.buttonVisible], (stored) => {
    const savedPosition = stored[STORAGE_KEYS.buttonPosition];
    const savedVisibility =
      typeof stored[STORAGE_KEYS.buttonVisible] === "boolean"
        ? stored[STORAGE_KEYS.buttonVisible]
        : true;

    setButtonVisibility(savedVisibility);

    if (
      savedPosition &&
      typeof savedPosition.left === "number" &&
      typeof savedPosition.top === "number"
    ) {
      applyButtonPosition(savedPosition.left, savedPosition.top);
      return;
    }

    const defaultPosition = applyButtonPosition(window.innerWidth - 74, window.innerHeight / 2 - 29);
    persistButtonPosition(defaultPosition.left, defaultPosition.top);
  });
}
