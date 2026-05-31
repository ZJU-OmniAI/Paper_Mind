# Chrome Web Store Listing Draft

## Name

Paper Tag Library

## Short Description

Save research papers, notes, and tags locally from Chrome.

## Detailed Description

Paper Tag Library helps researchers collect papers while browsing. Open the extension popup on any paper page, review the detected title, abstract, selected text, and source URL, then save the paper with existing or new tags.

Core features:

- Quick-add papers from the current Chrome tab
- Search existing tags or create new tags
- Save notes, abstracts, and selected text
- Open a full local management page inside the extension
- Browse papers and tags
- Keep untagged papers in a built-in "Unsorted" tag for later organization
- Create topic packs that aggregate papers by included and excluded tags
- Daily JSON backup to the user's Chrome downloads location
- Review LLM-generated tag merge suggestions before applying them
- Optional smart search and similar-paper recommendations with the user's own Qwen or Zhipu API Key
- Bilingual interface: Chinese and English
- No account required
- Paper and tag data stays in the extension's local IndexedDB database on the user's computer

## Category

Productivity

## Privacy Summary

The extension stores paper and tag data locally in IndexedDB and stores settings locally in Chrome extension storage. It does not collect analytics or sell/share user data. Optional LLM features send request text only to the model provider configured by the user.

## Permissions Justification

- `activeTab`: reads the current tab when the user opens the popup.
- `tabs`: obtains the current tab title and URL for paper metadata.
- `scripting`: extracts page description, heading, and selected text after user action.
- `storage`: stores model settings, optional API keys, and migration flags locally.
- `unlimitedStorage`: allows the user's IndexedDB paper library to grow beyond the default extension storage quota.
- `alarms`: schedules the daily local JSON backup.
- `downloads`: saves the daily backup file to the user's Chrome downloads location.
- `host_permissions` for DashScope and Zhipu: calls the configured LLM provider only when the user uses an LLM feature.
