# README screenshots

These images show the actual Paper_Mind extension UI with an isolated, synthetic library. Paper titles, abstracts, notes, tag descriptions and topic packs are authored demo content. Descriptions are explicitly marked as preview text. Screenshots do not represent a live model response, research findings, or the user's collection.

Both READMEs include four localized images:

- `library-{zh,en}.png`: keyword search combined with a tag filter.
- `tags-{zh,en}.png`: tag descriptions, aliases and linked papers.
- `capture-{zh,en}.png`: paper capture and relevant tag suggestions.
- `topics-{zh,en}.png`: a saved topic pack's inclusion and exclusion rules.

## Reproduce

From the repository root:

```bash
npm ci
npx playwright install chromium
node scripts/capture-readme.mjs
```

Or use an installed Chrome:

```bash
PW_CHANNEL=chrome node scripts/capture-readme.mjs
```

The script starts a temporary loopback server on an automatically assigned port and opens an isolated browser context for each language. It injects a minimal Chrome API adapter with demo data and blocks all non-local requests. It uses no personal browser profile, real API key, clipboard content, or live model calls. It closes the server and browser on completion. Application HTML, CSS and rendering code are used as-is; the topic-pack and popup images are element screenshots.
