# AI Wire

AI Wire is a responsive, installable reader for AI news, research papers, podcasts, and videos, built by [Farzan Hosseini](https://github.com/farzanini), an AI and software engineer.

## Features

- Browse RSS and Atom stories across news, papers, podcasts, and video sections.
- Search stories across sections; filter by topic, source, or unread status.
- Read summaries, play podcast episodes, and watch embedded YouTube videos.
- Translate story text into Persian, with a link to translate the full article.
- Customize the accent color and light or dark theme; reading and display preferences are saved in the browser.
- Refresh headline data from configured feeds. `feeds.json` defines the sources; `npm run feeds` fetches them and writes `dist/data/stories.json`.

## Tech stack

React 18, TypeScript, Vite, Tailwind CSS 4, Motion, and Lucide icons. The feed collector uses Node.js built-in APIs and requires Node 20 or later.

## Getting started

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

To fetch feed data, run `npm run feeds`. It writes the generated stories to `dist/data/stories.json`; feed access requires an internet connection. The app requests stories from `data/stories.json` at runtime.

## Project structure

```text
src/                  React app, UI components, styles, and translation helpers
scripts/fetch-feeds.mjs  RSS/Atom feed collector
feeds.json            Feed sources and section/topic settings
public/               App icons, web manifest, and service worker
```
