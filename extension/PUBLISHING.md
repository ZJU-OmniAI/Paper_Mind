# Publishing Checklist

This folder is prepared as a Manifest V3 Chrome extension.

## Build ZIP

From the project root:

```bash
npm run package:extension
```

The output file is created under:

```text
dist/paper-tag-library-extension.zip
```

## Chrome Web Store Steps

1. Create or open a Chrome Web Store developer account.
2. Upload the ZIP package.
3. Fill listing text from `STORE_LISTING.md`.
4. Provide a privacy policy using `PRIVACY.md`.
5. Upload screenshots and promotional assets.
6. Complete the privacy practices questionnaire.
7. Submit for review.

## Current Distribution Model

This release is a Chrome extension plus a local companion service. Users install the extension from Chrome and run the local Paper Tag Library service on their computer. Data is stored locally by the companion service in `data/store.json`.

For a fully standalone Chrome-only release, the storage layer should be migrated from the local service to `chrome.storage.local` or IndexedDB inside the extension.

