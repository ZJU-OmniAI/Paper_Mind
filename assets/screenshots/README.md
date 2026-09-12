# README screenshots

These images show the actual Paper_Mind extension UI with an isolated, synthetic library. Paper titles, abstracts, notes, tag descriptions and topic packs are authored demo content. Descriptions are explicitly marked as preview text. Screenshots do not represent a live model response, research findings, or the user's collection.

Each README includes eleven localized images: eight sequential walkthrough screenshots and three feature overviews. The walkthrough follows **Reading Papers with Evidence-Aware Agents** from a new capture to a saved paper found through the **Agents / 智能体** tag.

| Step | Filename (suffix `-{zh,en}.png`) | Action and visible result |
| --- | --- | --- |
| 1 | `step-01-capture` | Open the popup with extracted page metadata. |
| 2 | `step-02-tag-search` | Search `agent` and read the existing tag's description. |
| 3 | `step-03-ready-to-save` | Select Agents and Evaluation, set a 4.5 score and add a reading note. |
| 4 | `step-04-saved` | Submit the actual form; show the saved banner and paper count increasing from 8 to 9. |
| 5 | `step-05-library` | Open the manager through the popup; the saved paper is first under Recently added. |
| 6 | `step-06-find-tag` | Search `agent` in the tag sidebar; the paper list still has 9 entries. |
| 7 | `step-07-tag-results` | Click Agents to filter the library to 3 matching papers. |
| 8 | `step-08-paper-detail` | Open the saved paper and verify its tags and original reading note. |

Feature overviews:

- `library-{zh,en}.png`: keyword search combined with a tag filter.
- `tags-{zh,en}.png`: tag descriptions, aliases and linked papers.
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

The script starts a temporary loopback server on an automatically assigned port and opens an isolated browser context for each language. It injects a minimal Chrome API adapter with demo data and blocks all non-local requests. Page extraction is simulated with sample metadata; these are extension UI screenshots, not screenshots of a live paper website or Chrome's toolbar. The adapter navigates within the isolated page when the extension opens its manager.

The form submission, IndexedDB storage, search, filtering and detail rendering use the real application code. The script checks that the same saved paper retains both tags, its 4.5 score and note after navigation, that tag search leaves all 9 papers visible, and that clicking the tag narrows the list to 3. No result cards or success banners are injected for the screenshots.

No personal browser profile, real API key, clipboard content or live model call is used. The server and browser close on completion. Application HTML, CSS and rendering code are used as-is. Popup, filtered-results, paper-detail and topic-pack images are element screenshots; library browsing steps show the viewport, with the list continuing below the fold.
