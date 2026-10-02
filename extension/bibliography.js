// Bibliographic facts come from the page or a scholarly database, never an LLM.
export function normalizeBibliography(input = {}) {
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const names = Array.isArray(input.authors) ? input.authors : String(input.authors || '').split(/[;；\n]+/);
  const authors = [...new Set(names.map(author => clean(typeof author === 'object' ? author?.name : author)).filter(Boolean))];
  const year = String(input.year ?? '').trim();
  return { authors, year: /^[12]\d{3}$/.test(year) ? year : '', venue: clean(input.venue) };
}

export function mergeBibliography(target, incoming, { replace = false } = {}) {
  const normalized = normalizeBibliography(incoming);
  for (const field of ['authors', 'year', 'venue']) {
    if (Object.hasOwn(incoming, field) && (replace || !target[field]?.length)) target[field] = normalized[field];
  }
}

// Self-contained because Chrome serializes this function into the current tab.
export function pagePaperMetadata() {
  const values = name => [...document.querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`)].map(el => el.content?.trim()).filter(Boolean);
  const first = (...names) => names.map(name => values(name)[0]).find(Boolean) || '';
  const title = first('citation_title', 'og:title') || document.querySelector('h1')?.innerText?.trim() || document.title || '';
  const description = first('citation_abstract') || document.querySelector('blockquote.abstract')?.innerText?.replace(/^Abstract:?\s*/i, '').trim() || first('description', 'og:description');
  let authors = values('citation_author');
  let date = first('citation_publication_date', 'citation_date', 'dc.date', 'DC.Date');
  let venue = first('citation_journal_title', 'citation_conference_title', 'prism.publicationName');
  // Only academic JSON-LD: a blog byline must not become the paper's authors.
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) return value.forEach(item => visit(item, depth + 1));
    const types = [value['@type']].flat();
    if (types.some(type => ['ScholarlyArticle', 'MedicalScholarlyArticle'].includes(type))) {
      if (!authors.length) authors = [value.author || []].flat().map(author => typeof author === 'string' ? author : author?.name).filter(Boolean);
      date ||= value.datePublished || '';
      const publication = value.isPartOf;
      venue ||= typeof publication === 'string' ? publication : publication?.name || '';
    }
    visit(value['@graph'], depth + 1);
    visit(value.mainEntity, depth + 1);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (script.textContent.length > 1_000_000) continue;
    try { visit(JSON.parse(script.textContent)); } catch { /* Invalid page metadata is optional. */ }
  }
  return { title: title.trim(), description, selectedText: window.getSelection()?.toString().trim() || '',
    authors, year: String(date).match(/\b[12]\d{3}\b/)?.[0] || '', venue };
}
