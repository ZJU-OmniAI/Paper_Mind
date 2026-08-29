# Publishing Checklist

`extension/` is a standalone Manifest V3 Chrome extension; everything below is about shipping it.

## Build ZIP

From the project root:

```bash
npm run package:extension
```

The output file is created under:

```text
dist/Paper_Mind-extension.zip
```

## Chrome Web Store Steps

1. Create or open a Chrome Web Store developer account (one-time USD 5 registration fee).
2. Upload the ZIP package.
3. Fill listing text from [`store-listing.md`](store-listing.md).
4. Provide a privacy policy URL. [`PRIVACY.md`](../PRIVACY.md) is the text; the store needs it at a public URL, so publish it via GitHub Pages or link to the file on GitHub.
5. Upload screenshots and promotional assets (see `assets/`).
6. Complete the privacy practices questionnaire — the permission justifications in [`store-listing.md`](store-listing.md) cover every permission in the manifest.
7. Submit for review.

## GitHub Release Steps

1. Bump `version` in `extension/manifest.json` and `package.json`, and add an entry to [`CHANGELOG.md`](../CHANGELOG.md).
2. `npm run package:extension`.
3. Tag the commit (`git tag v1.3.3`) and push it.
4. Create a GitHub Release for the tag and attach `dist/Paper_Mind-extension.zip`.

## Distribution Model

This release is a pure Chrome extension. Users install the extension and can use it immediately. Papers, tags, abstracts, and notes are stored in the extension's IndexedDB database. Model settings and optional API keys are stored in `chrome.storage.local`. LLM features are optional and require the user to provide their own Qwen or Zhipu API Key.
