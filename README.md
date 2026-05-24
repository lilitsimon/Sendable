# Sendable

Sendable is a Chrome extension and backend proxy for non-native professionals who already know what they want to say and just want it to sound clear, natural, and ready to send.

Core promise: keep your voice, improve the writing.

## Structure

- `extension/` Chrome extension popup, floating panel, service worker, and content scripts
- `api/` backend route for Sendable refinement requests

## Local setup

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example`
3. Set `OPENAI_API_KEY`
4. Update `extension/config.js` with your deployed backend URL
5. Load `extension/` as an unpacked extension in Chrome

## API

- `POST /api/refine-email`
- Body: `{ "text": "...", "mode": "professional_text_refine_v1" }`
