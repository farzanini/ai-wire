# AI Wire

A small installable news reader for AI headlines. A GitHub Actions job reads the RSS feeds in `feeds.json` every 3 hours, builds the React app (Vite, Tailwind, shadcn/ui components, Motion), writes `dist/data/stories.json`, and publishes `dist/` to GitHub Pages.

- Add or remove sources: edit `feeds.json`.
- Force an update: Actions → "Update headlines and deploy" → Run workflow.
