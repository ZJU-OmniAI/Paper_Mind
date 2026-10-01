# Privacy Policy

Paper_Mind stores paper titles, abstracts, personal memory sentences, reading status, notes, clips, tags and topic packs in the extension's local IndexedDB database. Model settings, optional API keys and the optional bridge connection token are stored in `chrome.storage.local`. The extension does not require a Paper_Mind account, operate a remote library service, collect analytics or sell data.

The extension may create a daily JSON backup at 4 PM local time through Chrome's downloads API. Backups include library records and reading progress, but exclude model API keys and bridge tokens. They are saved to the user's configured Chrome downloads location.

Clipboard text is read only when the user clicks “Paste clipboard”. Opening the popup does not read the clipboard. Pasted text is stored only if the paper is saved.

Web clipping reads the main content of the current page when the popup opens to offer it as a clip. Text is saved only when the user keeps “Save page content” enabled and saves the entry. Images referenced by saved clips may be downloaded without cookies, credentials or a referrer to a “Paper_Mind剪藏” folder in the Chrome downloads directory. Deleting an entry removes its image records from the extension but does not delete downloaded files from disk. Citation counts and link previews may query their respective metadata services or source websites.

## Optional model processing

Connecting a model enables requests to the user's selected backend: Qwen / DashScope, Zhipu GLM, Kimi Code, DeepSeek, a configured Chat Completions-compatible API, or a signed-in local Claude Code / Codex CLI. These model services process text under their own policies. A local CLI is a local connection method, **not a guarantee of offline inference**. A locally hosted compatible model can be used through the API settings.

Manual model operations include concept-to-tag matching, semantic paper search, similar-paper recommendations, translation, model tests and tag-merge suggestions. Concept matching may send the query and the existing tag catalog, including names, aliases, descriptions, and up to eight linked paper titles and memory sentences per tag. Other operations send the paper text needed for their respective tasks.

After a model is configured, saving a paper may also trigger background abstract translation and similar-paper recommendations. With automatic tag descriptions enabled (the default), saving papers or updating tags may send each tag's name, aliases and excerpts from up to six linked papers. Each paper contributes at most 280 characters of memory, 2,400 of abstract, 1,200 of notes and 3,600 of clip text. Image files are not sent for tag descriptions. Generated descriptions, provenance and failure state are stored locally. Automatic descriptions can be disabled in Settings; manual generation remains available.

## Optional local bridge

The bridge starts only when the user runs `npm run bridge`. It listens on `127.0.0.1`, requires a random connection token, checks Host and Origin, and accepts only the supported fixed CLI operations. The default token file is `~/.paper-mind/bridge-token`, restricted to the current user. Neither the bridge nor the extension copies CLI login credentials into the library.

Prompts are sent to child processes over stdin. Requests run in temporary directories and their temporary answer files are removed on completion or failure. Claude uses no-session-persistence with tools, MCP and hooks disabled. Codex uses ephemeral execution, a read-only sandbox and disabled shell, apps, web search and subagents; its user configuration is not inherited. The bridge does not log prompts or responses. These controls do not override the CLI/model vendor's own service retention, diagnostics or account policies.

Use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.
