# Underleaf

Underleaf is a small, self-hosted LaTeX editor inspired by the Overleaf editing workflow. It is currently designed for one trusted local user, with project ownership kept in the data model so authentication can be added later.

## Requirements

- Node.js 22+
- Corepack or pnpm
- A local LaTeX toolchain with `latexmk` for PDF compilation

## Getting started

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

The web app runs on `http://localhost:5173` and the API on `http://localhost:3001` by default.

## Configuration

Server environment variables:

- `DATABASE_URL`: SQLite path. Defaults to `<UNDERLEAF_DATA_DIR>/underleaf.sqlite`.
- `UNDERLEAF_DATA_DIR`: Project source/PDF storage. Defaults to `.underleaf-data`.
- `LATEXMK_BIN`: LaTeX compiler binary. Defaults to `latexmk`.
- `SERVER_PORT`: API port. Defaults to `3001`.
- `WEB_ORIGIN`: CORS origin. Defaults to `http://localhost:5173`.

## Current scope

- Project dashboard
- Starter templates for article, report, and beamer
- File tree and Monaco editor
- Debounced autosave
- Local `latexmk` compilation
- PDF preview
- Split, editor-only, and PDF-only layouts
