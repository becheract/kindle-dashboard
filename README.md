# Marginalia

A self-hosted dashboard for your Kindle. It shows every book you've read and, for each
one, your highlights, your notes, and the words you looked up, with definitions.

**→ [Read the guide](docs/GUIDE.md)** to install it on an Ubuntu server and use it.

## Quick start (Ubuntu)

```bash
git clone https://github.com/<your-account>/kindle-dashboard.git
cd kindle-dashboard
sudo ./deploy/install.sh
```

## Development

Requires Node.js 22.6 or newer. TypeScript runs directly, so there's no build step.

```bash
npm install
npm test
npm start                     # http://localhost:3000, data in ./data/
npm run parse -- --clippings "My Clippings.txt" --vocab vocab.db --out library.json
```

## How it's built

| Path | What it does |
| --- | --- |
| `src/clippings.ts` | Parses `My Clippings.txt`, drops superseded highlights, and attaches notes to highlights |
| `src/vocab.ts` | Reads Vocabulary Builder's `vocab.db` with sql.js |
| `src/titles.ts` | Turns file-name titles into a clean title and author |
| `src/library.ts` | Combines both into one library grouped by book |
| `src/server/` | The website (Hono with built-in `node:sqlite`): accounts, uploads, book pages, the definition cache, `/api/sync` |
| `deploy/` | Installer and systemd service |

Each user's library is stored as one JSON document, and new uploads are merged into it,
so uploads only ever add. Definitions come from [dictionaryapi.dev](https://dictionaryapi.dev)
and are cached in the database.

## Roadmap

- [x] Parse Kindle clippings and vocabulary
- [x] Website with accounts, uploads and book pages
- [ ] Auto-sync script for jailbroken Kindles
- [ ] KOReader highlights and vocabulary through a KOReader plugin
