# AI Wire

A small installable news reader for AI headlines. A GitHub Actions job reads the RSS feeds in `feeds.json` every 3 hours, writes `site/data/stories.json`, and publishes `site/` to GitHub Pages.

- Add or remove sources: edit `feeds.json`.
- Force an update: Actions → "Update headlines and deploy" → Run workflow.
