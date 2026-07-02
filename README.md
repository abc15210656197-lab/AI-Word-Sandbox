<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/64b6fc57-a874-40bf-8575-34e26bbb6602

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set server-only `GEMINI_API_KEY` in [.env.local](.env.local); use `VITE_GEMINI_API_KEY` only for intentionally public browser-side calls
3. Run the app:
   `npm run dev`
