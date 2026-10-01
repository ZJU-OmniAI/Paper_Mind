import { READING_STATUSES, readingStatusLabel } from './library-tools.js';

export function renderWorkflowLabels(language) {
  const en = language === 'en';
  document.querySelectorAll('[data-zh]').forEach(el => { if (!el.disabled) el.textContent = en ? el.dataset.en : el.dataset.zh; });
  document.querySelectorAll('[data-placeholder-zh]').forEach(el => { el.placeholder = en ? el.dataset.placeholderEn : el.dataset.placeholderZh; });
  document.querySelectorAll('[data-reading-status]').forEach(select => {
    const value = select.value;
    const options = READING_STATUSES.map(status => new Option(readingStatusLabel(status, language), status));
    if (select.hasAttribute('data-all-status')) options.unshift(new Option(en ? 'Any reading status' : '全部阅读状态', ''));
    select.replaceChildren(...options);
    if ([...select.options].some(option => option.value === value)) select.value = value;
    select.setAttribute('aria-label', en ? 'Reading status' : '阅读状态');
  });
}
