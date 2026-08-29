# Privacy Policy

Paper_Mind stores paper titles, abstracts, notes, and tags locally in the extension's IndexedDB database on the user's computer. Model settings and optional API keys are stored locally in `chrome.storage.local`.

The extension may create a daily JSON backup at 4 PM local time using Chrome's downloads API. The backup is saved to the user's configured Chrome downloads location and does not include API keys.

When the popup is opened to add a paper, the extension may read plain text from the clipboard to prefill the notes/conversation field. Clipboard text is stored only if the user saves the paper.

Web clipping: when the user opens the popup, the extension reads the main content of the current page in order to offer it as a clip. The clipped text is stored only if the user keeps the "save page content" checkbox ticked and saves the entry. If a clip is saved, the extension then downloads the images referenced by that page's content and writes them as ordinary files into a "Paper_Mind剪藏" folder inside the user's Chrome downloads directory, so the clip stays readable offline and the files remain usable outside the browser. These requests go only to the image hosts of the page the user chose to clip, carry no referrer, and send no cookies or credentials. Clipped content and downloaded images never leave the user's computer. Deleting an entry removes the extension's record of the images but does not delete the files from disk.

The extension does not require registration, does not operate a remote account service, and does not collect analytics, advertising identifiers, financial information, health information, or personal communications.

When the user enables LLM features by entering an API key, the extension may send the text needed for that model request to the provider selected by the user:

- Qwen / DashScope
- Zhipu GLM

The extension does not sell, share, or transfer user data to third parties. Data is transmitted only when the user explicitly uses an LLM feature such as smart search, similar-paper recommendation, model testing, or tag-merge suggestions.

Use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.
