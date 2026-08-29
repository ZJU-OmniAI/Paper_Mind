# Contributing to Paper_Mind

Thanks for taking a look. Issues and pull requests are both welcome.

## Development setup

There is no build step and no server. The extension is plain ES modules loaded directly by Chrome.

1. Clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the `extension/` folder.
3. Enable **"Allow access to file URLs"** for the extension so the manager page can display clipped images from disk.
4. Edit a file, hit the reload button on the extension card, and test.

Which surface reloads how:

| You changed | How to see it |
|---|---|
| `popup.js` / `popup.html` / `popup.css` | close and reopen the popup |
| `manager.js` / `manager.html` / `manager.css` | refresh the manager tab |
| `background.js`, `storage.js`, `clipper.js`, `citations.js`, `clip-archive.js` | reload the extension in `chrome://extensions` |
| `manifest.json`, `_locales/*` | reload the extension |

Build the distributable ZIP with:

```bash
npm run package:extension   # writes dist/Paper_Mind-extension.zip
```

## Code layout

```
extension/
├── manifest.json      # MV3 manifest
├── popup.*            # the toolbar popup: capture and save
├── manager.*          # the full library page: browse, search, tags, settings
├── background.js      # service worker: daily backup alarm, image archiving
├── storage.js         # IndexedDB layer, dedup/merge logic, LLM calls
├── clipper.js         # web page → Markdown extraction
├── clip-archive.js    # clipped images → files on disk
├── citations.js       # Semantic Scholar citation lookup
├── offscreen.*        # offscreen document (blob URLs a worker cannot create)
└── _locales/          # zh_CN and en UI strings
```

## Things to keep in mind

- **Local-first is the point.** Nothing should be uploaded anywhere without the user explicitly triggering it. Any new network call needs a clear reason and a mention in `PRIVACY.md`.
- **API keys never leave local storage.** They must not appear in exports, backups, or logs.
- **Don't rename the IndexedDB database** (`paperTagLibrary`) or bump `DB_VERSION` without a migration — that is somebody's whole library.
- **Both locales.** New user-facing strings go into `_locales/en` and `_locales/zh_CN`, or into the bilingual string tables in `manager.js`.
- **Don't break existing clips.** Image paths already written to disk are permanent; changing the folder scheme needs a fallback for older records.

## Pull requests

- One focused change per PR.
- Say what you tested manually — which pages you clipped, which flows you clicked through. There is no automated test suite yet.
- Commit messages in the conventional style (`feat:`, `fix:`, `docs:`, `chore:`) are appreciated.

## Reporting bugs

Include your Chrome version, what you did, what happened, and what you expected. For clipping problems, the URL of the page you were clipping helps a lot. Errors from the service worker console (`chrome://extensions` → Paper_Mind → **service worker**) are the most useful thing you can attach.
