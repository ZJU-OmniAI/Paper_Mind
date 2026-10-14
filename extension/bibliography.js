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
// Tests pass a document explicitly; injected calls read the live page.
export function pagePaperMetadata(doc = document) {
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const text = el => clean(el?.innerText || el?.textContent);
  const uniq = list => [...new Set(list.map(clean).filter(Boolean))];
  // Attribute names differ in case across publishers (DC.Title, dc.title, citation_Title).
  const metas = (...names) => names.flatMap(name => [...doc.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i]`)].map(el => clean(el.content))).filter(Boolean);
  const first = (...names) => metas(...names)[0] || '';
  // Drop footnote marks: "Ziyang Wang*", "Shoubin Yu1,2".
  const tidy = value => clean(value).replace(/[,，;；]+$/, '').replace(/[\s*∗†‡§¶#]+$/u, '').replace(/(?<=\p{L})\d+(?:\s*,\s*\d+)*$/u, '').trim();
  // Highwire and Dublin Core often write "Last, First"; show names the way arXiv and S2 do.
  const person = value => {
    const name = tidy(value);
    const parts = name.split(/\s*,\s*/);
    return parts.length === 2 && parts[0] && parts[1] && !/^(?:jr|sr|ii|iii|iv)\.?$/i.test(parts[1]) ? `${parts[1]} ${parts[0]}` : name;
  };
  const host = String(doc.location?.hostname || '').toLowerCase();
  const isIeee = /(^|\.)ieeexplore\.ieee\.org$/.test(host);

  const metaTitle = first('citation_title', 'dc.title', 'eprints.title', 'prism.title', 'bepress_citation_title');
  let authors = uniq(metas('citation_author', 'eprints.creators_name', 'bepress_citation_author').map(person));
  if (!authors.length) authors = uniq(first('citation_authors').split(/\s*;\s*/).map(person));
  // Dublin Core creators only count on pages that also declare a document title (ACM, OJS, repositories).
  if (!authors.length && first('dc.title')) authors = uniq(metas('dc.creator', 'dc.creator.personalname', 'dcterms.creator').map(person));
  let date = first('citation_publication_date', 'citation_date', 'citation_online_date', 'citation_cover_date', 'citation_year', 'prism.publicationdate', 'prism.coverdate', 'dc.date.issued', 'dcterms.issued', 'dc.date', 'eprints.date', 'bepress_citation_date');
  let venue = first('citation_journal_title', 'citation_conference_title', 'citation_conference', 'citation_inbook_title', 'citation_book_title', 'prism.publicationname', 'eprints.publication', 'bepress_citation_journal_title');
  let metaAbstract = first('citation_abstract', 'eprints.abstract', 'dcterms.abstract') || (metaTitle ? first('dc.description') : '');
  const doiText = [first('citation_doi', 'prism.doi', 'bepress_citation_doi', 'dc.identifier.doi'), ...metas('dc.identifier')];
  let scholarly = Boolean(metaTitle || authors.length || first('citation_doi', 'citation_journal_title', 'citation_conference_title', 'citation_pdf_url'));

  // IEEE Xplore keeps its record in a script variable instead of citation_* tags.
  let ieee = null;
  if (isIeee) {
    for (const script of doc.querySelectorAll('script:not([src])')) {
      const match = script.textContent.match(/xplGlobal\.document\.metadata\s*=\s*(\{[\s\S]*?\});\s*(?:\n|$)/);
      if (!match) continue;
      try { ieee = JSON.parse(match[1]); } catch { /* Fall back to the visible page. */ }
      break;
    }
    if (!authors.length) authors = uniq((ieee?.authors || []).map(author => person(author?.name)));
    if (!authors.length) authors = uniq([...doc.querySelectorAll('.authors-info .blue-tooltip > a')].map(el => person(text(el))));
    date ||= String(ieee?.publicationYear || ieee?.publicationDate || '');
    venue ||= clean(ieee?.displayPublicationTitle || ieee?.publicationTitle) || text(doc.querySelector('.stats-document-abstract-publishedIn a'));
    metaAbstract ||= clean(ieee?.abstract);
    doiText.push(ieee?.doi || '', text(doc.querySelector('.stats-document-abstract-doi a')));
    scholarly ||= Boolean(ieee || authors.length);
  }

  // ScienceDirect lists authors only in the page body ("given-name" + "surname").
  if (!authors.length && /(^|\.)sciencedirect\.com$/.test(host)) {
    authors = uniq([...doc.querySelectorAll('#author-group .react-xocs-alternative-link')].map(el => tidy(text(el))));
  }

  // Only academic JSON-LD: a blog byline must not become the paper's authors.
  let ldTitle = '';
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) return value.forEach(item => visit(item, depth + 1));
    const types = [value['@type']].flat();
    if (types.some(type => ['ScholarlyArticle', 'MedicalScholarlyArticle', 'Thesis'].includes(type))) {
      scholarly = true;
      ldTitle ||= clean(value.headline || value.name);
      if (!authors.length) authors = uniq([value.author || []].flat().map(author => person(typeof author === 'string' ? author : author?.name || [author?.givenName, author?.familyName].filter(Boolean).join(' '))));
      date ||= value.datePublished || '';
      const publication = value.isPartOf;
      venue ||= clean(typeof publication === 'string' ? publication : publication?.name);
      metaAbstract ||= clean(value.abstract);
    }
    visit(value['@graph'], depth + 1);
    visit(value.mainEntity, depth + 1);
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    if (script.textContent.length > 1_000_000) continue;
    try { visit(JSON.parse(script.textContent)); } catch { /* Invalid page metadata is optional. */ }
  }

  // Academic project pages (Nerfies / Academic Project Page templates) and GitHub READMEs.
  const templateTitle = text(doc.querySelector('.publication-title'));
  if (!authors.length && templateTitle) {
    const block = [...doc.querySelectorAll('.publication-authors')].find(el => el.querySelector('.author-block'));
    const affiliation = /universit|institut|college|school|academy|laborator|\blab\b|research|google|meta\b|microsoft|nvidia|deepmind|openai|inc\.?$|大学|学院|研究院|实验室|equal contribution|corresponding/i;
    // Blocks are already "First Last"; a block may hold several comma-separated names.
    authors = uniq([...(block?.querySelectorAll('.author-block') || [])].flatMap(el => text(el).split(/\s*[,，]\s*/)).map(tidy).filter(name => name.length <= 60 && /\p{L}/u.test(name) && !/\d/.test(name) && !affiliation.test(name)));
  }
  const readmeTitle = /(^|\.)github\.com$/.test(host) ? text(doc.querySelector('article.markdown-body h1, .markdown-body h1')) : '';
  const socialTitle = first('og:title', 'twitter:title');
  const h1 = text(doc.querySelector('h1'));
  const strongTitle = metaTitle || ldTitle || clean(ieee?.displayDocTitle || ieee?.title);
  const title = strongTitle || templateTitle || readmeTitle || socialTitle || h1 || clean(doc.title);

  // Abstracts: metadata first, then the page's own "Abstract" block; a site description is only a fallback.
  const stripLabel = value => clean(value).replace(/^(?:abstract|摘要)\s*[:：.\-—]?\s*/i, '');
  const sized = value => value.length >= 80 && value.length <= 8000 ? value : '';
  let domAbstract = '';
  for (const selector of ['blockquote.abstract', '#abstract', '#Abs1-content', '.abstract-content', 'section.abstract', 'div.abstract', '.ltx_abstract', '.acl-abstract', 'div.abstractSection', '#abstracts']) {
    domAbstract = sized(stripLabel(text(doc.querySelector(selector))));
    if (domAbstract) break;
  }
  if (!domAbstract) {
    const heading = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, dt')]
      .find(el => /^abstract$/i.test(text(el)) || (scholarly && /^摘\s*要$/.test(text(el))));
    let node = heading?.nextElementSibling;
    for (let step = 0; node && step < 4 && !domAbstract; step++, node = node.nextElementSibling) {
      if (/^H[1-6]$/.test(node.tagName)) break;
      domAbstract = sized(stripLabel(text(node)));
    }
    const parent = heading?.parentElement;
    if (!domAbstract && parent && parent.children.length <= 4 && text(parent).length <= 4000) domAbstract = sized(stripLabel(text(parent)));
  }
  const abstract = sized(stripLabel(metaAbstract)) || domAbstract;
  const description = abstract || first('description', 'og:description', 'twitter:description');

  // arXiv links on project pages / READMEs are candidates only; the caller verifies them by title.
  const arxivCounts = new Map();
  const addArxiv = (id, weight) => {
    const key = String(id || '').toLowerCase().replace(/v\d+$/, '');
    if (/^\d{4}\.\d{4,5}$/.test(key)) arxivCounts.set(key, (arxivCounts.get(key) || 0) + weight);
  };
  addArxiv(first('citation_arxiv_id'), 100);
  for (const link of [...doc.querySelectorAll('a[href]')].slice(0, 3000)) {
    const match = String(link.href || link.getAttribute('href')).match(/(?:arxiv\.org\/(?:abs|pdf|html)|alphaxiv\.org\/(?:abs|pdf|overview)|huggingface\.co\/papers)\/(\d{4}\.\d{4,5})/i);
    if (match) addArxiv(match[1], 1);
  }
  const doi = (doiText.join(' ').match(/\b10\.\d{4,9}\/[^\s"'<>]+/) || [''])[0].replace(/[.,;)]+$/, '').toLowerCase();

  return {
    title: clean(title),
    titleSource: strongTitle ? 'meta' : 'page',
    titleCandidates: uniq([strongTitle, templateTitle, readmeTitle, socialTitle, h1, doc.title]).slice(0, 6),
    description: clean(description),
    abstractSource: abstract ? 'paper' : description ? 'description' : '',
    selectedText: doc.defaultView?.getSelection?.()?.toString().trim() || '',
    authors,
    year: String(date).match(/\b[12]\d{3}\b/)?.[0] || '',
    venue: clean(venue),
    doi,
    arxivIds: [...arxivCounts].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 8),
    scholarly
  };
}
