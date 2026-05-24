const STORAGE_KEYS = {
  welcomeEmail: "sendable.welcomeEmail",
  welcomeNewsletter: "sendable.welcomeNewsletter",
  welcomeTermsAccepted: "sendable.welcomeTermsAccepted",
  welcomeCompleted: "sendable.welcomeCompleted"
};

const emailInput = document.getElementById("emailInput");
const termsToggle = document.getElementById("termsToggle");
const newsletterToggle = document.getElementById("newsletterToggle");
const welcomeForm = document.getElementById("welcomeForm");
const welcomeSubmitButton = document.getElementById("welcomeSubmitButton");
const welcomeStatus = document.getElementById("welcomeStatus");
const termsLink = document.getElementById("termsLink");
const welcomeSignupView = document.getElementById("welcomeSignupView");
const welcomeGuideView = document.getElementById("welcomeGuideView");
const guideGreeting = document.getElementById("guideGreeting");
const guideStepTitle = document.getElementById("guideStepTitle");
const guideStepCopy = document.getElementById("guideStepCopy");
const guideBackButton = document.getElementById("guideBackButton");
const guideNextButton = document.getElementById("guideNextButton");
const guideStatus = document.getElementById("guideStatus");
const guideDots = Array.from(document.querySelectorAll(".guide-dot"));
const guideScenes = Array.from(document.querySelectorAll("[data-guide-scene]"));

const GUIDE_STEPS = [
  {
    title: "Pin the extension",
    copy: "Click Chrome's puzzle icon, then pin Sendable so it stays one click away whenever you need it."
  },
  {
    title: "Use the floating button",
    copy: "Open any page where you write, then refresh the page. The Sendable button appears on the right, and you can drag it wherever it feels best."
  },
  {
    title: "Paste or pull selected text",
    copy: "Paste your draft into Sendable, or highlight text on the page and use Use selected text. Then click Make it sendable."
  }
];

let currentGuideStep = 0;

function setStatus(message) {
  welcomeStatus.textContent = message;
}

function setGuideStatus(message) {
  guideStatus.textContent = message;
}

function isValidEmail(email) {
  const normalized = email.trim();

  if (!normalized) {
    return false;
  }

  if (!emailInput.checkValidity()) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(normalized);
}

function updateSubmitState() {
  welcomeSubmitButton.disabled = !termsToggle.checked || !isValidEmail(emailInput.value);
}

async function captureWelcomeEmail(email) {
  if (!email || !WELCOME_CAPTURE_ENDPOINT) {
    return;
  }

  const response = await fetch(WELCOME_CAPTURE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      newsletter: newsletterToggle.checked,
      termsAccepted: termsToggle.checked,
      source: "extension_welcome"
    })
  });

  if (!response.ok) {
    let message = "Couldn't save this signup.";

    try {
      const data = await response.json();
      message = data.error || message;
    } catch (_error) {
      // Use fallback message.
    }

    throw new Error(message);
  }
}

function getGuideGreeting(email) {
  if (!email) {
    return "You're in. Here's how to start using Sendable.";
  }

  return `Welcome ${email}. Here's how to start using Sendable.`;
}

function renderGuideStep(index) {
  currentGuideStep = Math.max(0, Math.min(index, GUIDE_STEPS.length - 1));

  const step = GUIDE_STEPS[currentGuideStep];
  guideStepTitle.textContent = step.title;
  guideStepCopy.textContent = step.copy;

  guideScenes.forEach((scene, sceneIndex) => {
    scene.hidden = sceneIndex !== currentGuideStep;
  });

  guideDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === currentGuideStep);
  });

  guideBackButton.style.visibility = currentGuideStep === 0 ? "hidden" : "visible";
  guideNextButton.textContent =
    currentGuideStep === GUIDE_STEPS.length - 1 ? "Get started" : "Next";
}

function showGuide(email) {
  welcomeSignupView.hidden = true;
  welcomeGuideView.hidden = false;
  guideGreeting.textContent = getGuideGreeting(email);
  setGuideStatus("");
  renderGuideStep(0);
}

async function hydrateForm() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.welcomeEmail,
    STORAGE_KEYS.welcomeNewsletter,
    STORAGE_KEYS.welcomeTermsAccepted,
    STORAGE_KEYS.welcomeCompleted
  ]);

  const savedEmail = stored[STORAGE_KEYS.welcomeEmail];
  const savedNewsletter = stored[STORAGE_KEYS.welcomeNewsletter];
  const savedTerms = stored[STORAGE_KEYS.welcomeTermsAccepted];
  const savedCompleted = Boolean(stored[STORAGE_KEYS.welcomeCompleted]);

  if (typeof savedEmail === "string" && savedEmail.trim()) {
    emailInput.value = savedEmail;
  }

  newsletterToggle.checked =
    typeof savedNewsletter === "boolean" ? savedNewsletter : true;
  termsToggle.checked =
    typeof savedTerms === "boolean" ? savedTerms : true;

  try {
    const userInfo = await chrome.identity.getProfileUserInfo({
      accountStatus: "ANY"
    });

    if (!emailInput.value && userInfo?.email) {
      emailInput.value = userInfo.email;
    }
  } catch (_error) {
    // If Chrome doesn't provide a profile email, keep the field editable.
  }

  updateSubmitState();

  if (savedCompleted) {
    showGuide(emailInput.value.trim());
  }
}

welcomeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();

  if (!email) {
    setStatus("Add your email address to continue.");
    updateSubmitState();
    return;
  }

  if (!isValidEmail(email)) {
    setStatus("Add a valid email address to continue.");
    updateSubmitState();
    return;
  }

  if (!termsToggle.checked) {
    setStatus("Please accept the terms to continue.");
    updateSubmitState();
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.welcomeEmail]: email,
    [STORAGE_KEYS.welcomeNewsletter]: newsletterToggle.checked,
    [STORAGE_KEYS.welcomeTermsAccepted]: termsToggle.checked,
    [STORAGE_KEYS.welcomeCompleted]: true
  });

  try {
    await captureWelcomeEmail(email);
  } catch (error) {
    console.warn("Sendable welcome capture failed:", error);
  }

  setStatus("");
  showGuide(email);
});

termsToggle.addEventListener("change", () => {
  updateSubmitState();

  if (termsToggle.checked && isValidEmail(emailInput.value)) {
    setStatus("");
  }
});

newsletterToggle.addEventListener("change", () => {
  chrome.storage.local.set({
    [STORAGE_KEYS.welcomeNewsletter]: newsletterToggle.checked
  });
});

termsLink.addEventListener("click", (event) => {
  event.preventDefault();
  setStatus("Add your terms link next, then we can wire it here.");
});

emailInput.addEventListener("input", () => {
  updateSubmitState();

  if (!emailInput.value.trim()) {
    setStatus("");
    return;
  }

  if (isValidEmail(emailInput.value)) {
    setStatus("");
    return;
  }

  setStatus("Add a valid email address to continue.");
});

guideBackButton.addEventListener("click", () => {
  setGuideStatus("");
  renderGuideStep(currentGuideStep - 1);
});

guideNextButton.addEventListener("click", () => {
  if (currentGuideStep < GUIDE_STEPS.length - 1) {
    setGuideStatus("");
    renderGuideStep(currentGuideStep + 1);
    return;
  }

  setGuideStatus("You're ready. Pin Sendable, then refresh any page where you write to make the button appear.");
});

hydrateForm();
