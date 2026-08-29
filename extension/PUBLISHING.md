# Publishing Checklist

This folder is prepared as a standalone Manifest V3 Chrome extension.

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

1. Create or open a Chrome Web Store developer account.
2. Upload the ZIP package.
3. Fill listing text from `STORE_LISTING.md`.
4. Provide a privacy policy using `PRIVACY.md`.
5. Upload screenshots and promotional assets.
6. Complete the privacy practices questionnaire.
7. Submit for review.

## Distribution Model

This release is a pure Chrome extension. Users install the extension and can use it immediately. Papers, tags, abstracts, and notes are stored in the extension's IndexedDB database. Model settings and optional API keys are stored in `chrome.storage.local`. LLM features are optional and require the user to provide their own Qwen or Zhipu API Key.
