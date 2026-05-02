# Email Refiner Extension

A Chrome extension and small backend proxy for refining professional email drafts without changing the writer's voice.

## Structure

- `extension/` Chrome extension popup, service worker, and content script
- `api/` backend API routes for OpenAI calls

## Local setup

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example`
3. Set `OPENAI_API_KEY`
4. Update `extension/config.js` with your deployed backend URL
5. Load `extension/` as an unpacked extension in Chrome

## API

- `POST /api/refine-email`
- Body: `{ "text": "...", "mode": "email_refine_v1" }`
