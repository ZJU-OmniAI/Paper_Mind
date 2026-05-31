# Chrome Web Store Listing Draft

## Name

Paper Tag Library Quick Add

## Short Description

Save research papers and tags from Chrome into a local paper tag library.

## Detailed Description

Paper Tag Library Quick Add helps researchers collect papers while browsing. Open the extension popup on any paper page, review the detected title, abstract, selected text, and source URL, then save the paper with existing or new tags.

Core features:

- Quick-add papers from the current Chrome tab
- Search existing tags or create new tags
- Save notes, abstracts, and selected text
- Open the local management system from the extension
- Bilingual interface: Chinese and English
- Data stays on the user's computer through the companion local service

This extension is designed for a local-first workflow. The local Paper Tag Library service must be running at `127.0.0.1:5173`.

## Category

Productivity

## Privacy Summary

The extension communicates with a local service on the user's computer. It does not collect analytics or sell/share user data.

## Permissions Justification

- `activeTab`: reads the current tab when the user opens the popup.
- `tabs`: obtains the current tab title and URL for paper metadata.
- `scripting`: extracts page description, heading, and selected text after user action.
- `host_permissions` for localhost: saves data to the user's local Paper Tag Library service.

