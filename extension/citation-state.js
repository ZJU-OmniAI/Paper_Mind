// Bump when matching rules change so previously misidentified counts are rechecked.
export const CITATION_MATCH_VERSION = 2;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export function citationQueryKey(paper) {
  return JSON.stringify([paper.title || "", paper.sourceUrl || "", paper.authors || [], paper.year || ""]);
}

export function normalizeCitation(paper) {
  const key = citationQueryKey(paper);
  const changed = paper.citationQueryKey && paper.citationQueryKey !== key;
  if (paper.citationMatchVersion !== CITATION_MATCH_VERSION || changed) {
    Object.assign(paper, {
      citationCount: null, citationSource: "", citationStatus: "unverified",
      citationUpdatedAt: "", citationCheckedAt: "", citationExternalId: "",
      citationMatchedTitle: "", citationError: "", citationRequestId: ""
    });
  }
  if (!Number.isSafeInteger(paper.citationCount) || paper.citationCount < 0) paper.citationCount = null;
  paper.citationMatchVersion = CITATION_MATCH_VERSION;
  paper.citationQueryKey = key;
  for (const field of ["citationSource", "citationStatus", "citationUpdatedAt", "citationCheckedAt", "citationExternalId", "citationMatchedTitle", "citationError"]) {
    if (typeof paper[field] !== "string") paper[field] = "";
  }
}

export function hasCitationCount(paper) {
  return paper?.citationMatchVersion === CITATION_MATCH_VERSION &&
    (!paper.citationQueryKey || paper.citationQueryKey === citationQueryKey(paper)) &&
    ["ok", "error"].includes(paper.citationStatus) &&
    Number.isSafeInteger(paper.citationCount) && paper.citationCount >= 0;
}

export function citationNeedsRefresh(paper, now = Date.now()) {
  if (paper.citationMatchVersion !== CITATION_MATCH_VERSION || paper.citationStatus === "unverified") return true;
  const checked = Date.parse(paper.citationCheckedAt || paper.citationUpdatedAt || "");
  if (!Number.isFinite(checked)) return true;
  const age = paper.citationStatus === "error" ? 10 * MINUTE : paper.citationStatus === "ok" ? 14 * DAY : DAY;
  return now - checked > age;
}

export function citationSourceLink(paper) {
  return /^semanticscholar:/.test(paper?.citationSource || "") && /^[a-f0-9]{40}$/i.test(paper?.citationExternalId || "")
    ? `https://www.semanticscholar.org/paper/${paper.citationExternalId}` : "";
}
