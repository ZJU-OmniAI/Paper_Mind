import { normalizeBibliography } from './bibliography.js';
import { fetchPaperMetadata } from './citations.js';

export function bibliographyEditor(container, { getContext, getLanguage }) {
  container.innerHTML = `<div class="bibliography-heading"><strong data-zh="论文信息" data-en="Publication details"></strong><button type="button" class="secondary-button small-button" data-lookup-bibliography data-zh="补全空缺信息" data-en="Fill missing details"></button></div>
    <div class="bibliography-fields"><label class="bibliography-authors"><span data-zh="作者（用分号分隔）" data-en="Authors (separate with semicolons)"></span><input data-bib-field="authors" autocomplete="off" /></label><label><span data-zh="年份" data-en="Year"></span><input data-bib-field="year" inputmode="numeric" pattern="[12][0-9]{3}" maxlength="4" placeholder="2026" /></label><label class="bibliography-venue"><span data-zh="发表出处（会议 / 期刊）" data-en="Venue (conference / journal)"></span><input data-bib-field="venue" autocomplete="off" /></label></div>
    <p class="bibliography-status" data-zh="可手动修改；补查使用 Semantic Scholar / Crossref，填入后请核对并保存。" data-en="Editable. Lookup uses Semantic Scholar / Crossref; review the filled details before saving."></p><p class="bibliography-status" role="status"></p>`;
  const fields = Object.fromEntries([...container.querySelectorAll('[data-bib-field]')].map(el => [el.dataset.bibField, el]));
  const status = container.querySelector('[role="status"]'), button = container.querySelector('button');
  const ui = (zh, en) => getLanguage() === 'en' ? en : zh;
  let revision = 0;
  const edits = { authors:0, year:0, venue:0 };
  for (const [key, field] of Object.entries(fields)) field.addEventListener('input', () => { edits[key]++; });
  const message = text => { status.removeAttribute('data-zh'); status.removeAttribute('data-en'); status.textContent = text; };
  container.closest('form')?.addEventListener('reset', () => { revision++; message(''); });
  button.addEventListener('click', async () => {
    const context = getContext();
    if (!context.title?.trim() && !context.sourceUrl) return message(ui('先填写论文标题或打开论文页面。', 'Enter a title or open the paper page first.'));
    if (Object.values(fields).every(field => field.value.trim())) return message(ui('信息已齐全，可直接手动修改。', 'All details are filled. You can edit them directly.'));
    const request = ++revision, initial = Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,{value:field.value,edit:edits[key]}]));
    button.disabled = true;
    message(ui('正在补查空缺信息…', 'Looking up missing details…'));
    try {
      const result = await fetchPaperMetadata(context);
      if (request !== revision || JSON.stringify(context) !== JSON.stringify(getContext())) return;
      if (!result.found) return message(ui(result.ambiguous ? '存在同名论文，请手动核对信息。' : '没有找到可靠匹配，可手动填写。', result.ambiguous ? 'Ambiguous title. Please check the details manually.' : 'No reliable match found. You can enter details manually.'));
      const normalized = normalizeBibliography(result);
      let filled = 0;
      for (const [key, field] of Object.entries(fields)) {
        const value = key === 'authors' ? normalized.authors.join('; ') : normalized[key];
        if (!initial[key].value.trim() && !field.value.trim() && edits[key] === initial[key].edit && value) { field.value = value; filled++; }
      }
      message(filled ? ui(`已从 ${result.provider} 补全 ${filled} 项，请核对后保存。`, `Filled ${filled} fields from ${result.provider}. Review and save.`) : ui('保留你已填写的信息，没有可补全的空缺。', 'Your entries were kept; no missing details could be filled.'));
    } catch (error) {
      if (request === revision && JSON.stringify(context) === JSON.stringify(getContext())) message(ui('补查失败，可稍后重试或手动填写：', 'Lookup failed; retry or enter details manually: ') + error.message);
    } finally {
      button.disabled = false;
      if (request === revision && JSON.stringify(context) !== JSON.stringify(getContext())) message(ui('查询条件已改变，请重新补查。', 'The lookup context changed. Please try again.'));
    }
  });
  return {
    read: () => normalizeBibliography(Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value]))),
    set(paper = {}, { onlyMissing = false } = {}) {
      revision++;
      const normalized = normalizeBibliography(paper);
      for (const [key, field] of Object.entries(fields)) if (!onlyMissing || !field.value.trim()) field.value = key === 'authors' ? normalized.authors.join('; ') : normalized[key];
      message('');
    },
    invalidate() { revision++; message(''); }
  };
}
