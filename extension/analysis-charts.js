// HTML/SVG string builders for design charts shared by topic analysis and paper
// comparison. Inputs are validated report fields; every label is escaped here.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const array = value => Array.isArray(value) ? value : [];
const RANGE = 2;

// One hue per design choice; the same index means the same option in a row.
export const CHOICE_COLORS = ['#168a81', '#6e76b5', '#b18b54', '#b5577a', '#3b82c4', '#7a8b2e', '#8a5fb0', '#c2703d'];
export const choiceColor = index => index >= 0 ? CHOICE_COLORS[index % CHOICE_COLORS.length] : '';

const spread = axis => {
  const values = array(axis?.positions).map(item => item.value);
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length + new Set(values).size * 0.01;
};

// Default chart axes: the pair that places the most papers on both axes, then
// the pair along which those papers spread out the most.
export function bestAxisPair(axes) {
  const list = array(axes);
  if (list.length < 2) return list.length ? [0, -1] : [-1, -1];
  let best = null;
  for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const placed = new Set(array(list[y].positions).map(item => item.paperId));
    const both = array(list[x].positions).filter(item => placed.has(item.paperId)).length;
    const score = both * 100 + spread(list[x]) + spread(list[y]);
    if (!best || score > best.score + 1e-9) best = { pair: [x, y], score };
  }
  return best.pair;
}

const signed = value => value > 0 ? `+${value}` : String(value);
const lean = (axis, value, ui) => value === 0 ? ui('两端兼顾 / 居中', 'balanced') : `${value < 0 ? ui('偏向', 'toward') : ui('偏向', 'toward')} ${value < 0 ? axis.low : axis.high}`;
const lines = (text, width) => {
  const chars = Array.from(String(text)), out = [];
  const cjk = /[\u3400-\u9fff]/.test(text), size = cjk ? width : width * 2;
  for (let start = 0; start < chars.length; start += size) out.push(chars.slice(start, start + size).join(''));
  return out.slice(0, 2).map((line, index) => index === 1 && chars.length > size * 2 ? line.slice(0, -1) + '…' : line);
};

/**
 * Spectrum strips: each axis is a line between its two poles, with a dot per
 * positioned paper. dotAttrs(id) supplies the data attribute that dots carry.
 */
export function spectrumHtml({ axes, label, ui, isSelected = () => false, dotAttrs = () => '', caption = '' }) {
  const rows = array(axes).map((axis, axisIndex) => {
    const stacks = new Map();
    const dots = array(axis.positions).map(position => {
      const row = stacks.get(position.value) || 0;
      stacks.set(position.value, row + 1);
      const item = label(position.paperId), left = ((position.value + RANGE) / (RANGE * 2)) * 100;
      const title = `${item.number} ${item.title}\n${axis.axis}：${signed(position.value)}（${lean(axis, position.value, ui)}）${position.reason ? `\n${position.reason}` : ''}`;
      return `<button type="button" class="design-dot${isSelected(position.paperId) ? ' selected' : ''}" style="--x:${left}%;--row:${row}" title="${escape(title)}" aria-label="${escape(title)}" ${dotAttrs(position.paperId)}>${escape(item.number)}</button>`;
    });
    const depth = Math.max(1, ...stacks.values());
    return `<div class="design-spectrum" data-axis-index="${axisIndex}"><div class="design-spectrum-head"><strong>${escape(axis.axis)}</strong><small>${ui(`${axis.positions.length} 篇已定位`, `${axis.positions.length} placed`)}</small></div><div class="design-spectrum-row"><span class="design-pole low" title="${escape(axis.low)}">${escape(axis.low)}</span><div class="design-track" style="--rows:${depth}"><span class="design-track-line" aria-hidden="true"></span>${[0, 25, 50, 75, 100].map(x => `<span class="design-tick" style="--x:${x}%" aria-hidden="true"></span>`).join('')}${dots.join('')}</div><span class="design-pole high" title="${escape(axis.high)}">${escape(axis.high)}</span></div></div>`;
  });
  return `<div class="design-spectra">${rows.join('')}</div>${caption ? `<p class="design-chart-caption">${caption}</p>` : ''}`;
}

/** Design-space scatter on two axes. Papers sharing a cell sit on a small ring. */
export function scatterHtml({ axes, x, y, label, ui, isSelected = () => false, dotAttrs = () => '' }) {
  const X = array(axes)[x], Y = array(axes)[y];
  if (!X || !Y) return '';
  const values = new Map();
  for (const position of X.positions) values.set(position.paperId, { x: position.value, rx: position.reason || '' });
  for (const position of Y.positions) values.set(position.paperId, { ...(values.get(position.paperId) || {}), y: position.value, ry: position.reason || '' });
  const placed = [...values].filter(([, value]) => value.x !== undefined && value.y !== undefined);
  const missing = [...values].filter(([, value]) => value.x === undefined || value.y === undefined).map(([id]) => id);
  // The plot keeps an inner margin so papers at either pole stay inside it.
  const width = 660, height = 440, left = 118, right = 628, top = 48, bottom = 360, inset = 36;
  const sx = value => left + inset + ((value + RANGE) / (RANGE * 2)) * (right - left - inset * 2), sy = value => bottom - inset - ((value + RANGE) / (RANGE * 2)) * (bottom - top - inset * 2);
  const cells = new Map();
  for (const [id, value] of placed) {
    const key = `${value.x},${value.y}`;
    cells.set(key, [...(cells.get(key) || []), id]);
  }
  const showNames = placed.length <= 10;
  const points = [...cells].flatMap(([key, ids]) => {
    const [vx, vy] = key.split(',').map(Number), cx = sx(vx), cy = sy(vy);
    const ring = ids.length === 1 ? 0 : ids.length <= 6 ? 19 : 26;
    return ids.map((id, index) => {
      const angle = -Math.PI / 2 + (index / ids.length) * Math.PI * 2;
      const px = Math.round((cx + Math.cos(angle) * ring) * 10) / 10, py = Math.round((cy + Math.sin(angle) * ring) * 10) / 10;
      const item = label(id), value = values.get(id);
      const title = `${item.number} ${item.title}\n${X.axis}：${signed(value.x)}（${lean(X, value.x, ui)}）${value.rx ? ` · ${value.rx}` : ''}\n${Y.axis}：${signed(value.y)}（${lean(Y, value.y, ui)}）${value.ry ? ` · ${value.ry}` : ''}`;
      const name = showNames && ids.length === 1 ? (() => { const anchorEnd = px > right - 120; return `<text class="design-point-name" x="${anchorEnd ? px - 19 : px + 19}" y="${py + 4}" text-anchor="${anchorEnd ? 'end' : 'start'}">${escape(item.name)}</text>`; })() : '';
      return `<g class="design-point${isSelected(id) ? ' selected' : ''}" role="button" tabindex="0" ${dotAttrs(id)} aria-label="${escape(title)}"><title>${escape(title)}</title><circle cx="${px}" cy="${py}" r="14"/><text x="${px}" y="${py + 4}" text-anchor="middle">${escape(item.number)}</text>${name}</g>`;
    });
  });
  const ticks = [-2, -1, 0, 1, 2];
  const grid = ticks.map(value => `<line class="design-grid${value === 0 ? ' center' : ''}" x1="${sx(value)}" x2="${sx(value)}" y1="${top}" y2="${bottom}"/><line class="design-grid${value === 0 ? ' center' : ''}" x1="${left}" x2="${right}" y1="${sy(value)}" y2="${sy(value)}"/>`).join('');
  const yLow = lines(Y.low, 6), yHigh = lines(Y.high, 6);
  const tspans = (items, x, y) => items.map((line, index) => `<tspan x="${x}" y="${y + index * 15}">${escape(line)}</tspan>`).join('');
  const svg = `<svg class="design-scatter" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escape(ui(`设计空间图：横轴 ${X.axis}，纵轴 ${Y.axis}`, `Design space: ${X.axis} by ${Y.axis}`))}">
    <rect class="design-plot" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="10"/>${grid}
    <text class="design-axis-name" x="${left}" y="${top - 18}">${escape(ui('纵轴', 'Y'))} · ${escape(Y.axis)}</text>
    <text class="design-pole-arrow" x="${left - 12}" y="${top + 14}" text-anchor="end">↑</text><text class="design-pole-label" text-anchor="end">${tspans(yHigh, left - 12, top + 31)}</text>
    <text class="design-pole-label" text-anchor="end">${tspans(yLow, left - 12, bottom - 22 - (yLow.length - 1) * 15)}</text><text class="design-pole-arrow" x="${left - 12}" y="${bottom - 2}" text-anchor="end">↓</text>
    <text class="design-pole-label" x="${left}" y="${bottom + 24}">← ${escape(X.low)}</text><text class="design-pole-label" x="${right}" y="${bottom + 24}" text-anchor="end">${escape(X.high)} →</text>
    <text class="design-axis-name" x="${(left + right) / 2}" y="${bottom + 56}" text-anchor="middle">${escape(ui('横轴', 'X'))} · ${escape(X.axis)}</text>
    ${points.join('')}</svg>`;
  return `${svg}${missing.length ? `<p class="design-chart-caption">${ui('仅在一条轴上定位：', 'Placed on one axis only: ')}${missing.map(id => escape(label(id).number)).join(' · ')}</p>` : ''}`;
}

/** Pairwise design similarity heatmap in the given paper order. */
export function heatmapHtml({ similarity, order, label, ui }) {
  const ids = order.slice(0, 60), size = 26, margin = 32, n = ids.length, showValues = n <= 12;
  const cells = ids.flatMap((a, row) => ids.map((b, column) => {
    const x = margin + column * size, y = margin + row * size;
    if (a === b) return `<rect class="design-heat-self" x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="3"/>`;
    const item = similarity.get(a, b), percent = Math.round(item.value * 100);
    const title = `${label(a).number} × ${label(b).number}　${label(a).name} / ${label(b).name}\n${item.compared ? ui(`设计选择 ${item.same}/${item.compared} 个维度相同`, `Same choice in ${item.same}/${item.compared} dimensions`) : ui('没有共同比较的维度', 'No shared dimension')}${item.foundations ? ui(` · 共享 ${item.foundations} 条共同基础`, ` · ${item.foundations} shared foundations`) : ''}\n${ui('相似度', 'Similarity')} ${percent}%`;
    return `<g class="design-heat-cell"><title>${escape(title)}</title><rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="3" style="fill-opacity:${(0.06 + item.value * 0.82).toFixed(3)}"/>${showValues && item.known ? `<text x="${x + size / 2}" y="${y + size / 2 + 3.5}" text-anchor="middle" class="${item.value > 0.55 ? 'on-dark' : ''}">${percent}</text>` : ''}</g>`;
  }));
  const labels = ids.map((id, index) => `<text class="design-heat-label" x="${margin + index * size + size / 2}" y="${margin - 9}" text-anchor="middle">${escape(label(id).number)}</text><text class="design-heat-label" x="${margin - 7}" y="${margin + index * size + size / 2 + 3.5}" text-anchor="end">${escape(label(id).number)}</text>`).join('');
  const total = margin + n * size + 4;
  return `<svg class="design-heatmap" viewBox="0 0 ${total} ${total}" style="max-width:${Math.max(220, total * 1.15)}px" role="img" aria-label="${escape(ui('论文两两之间的设计相似度', 'Pairwise design similarity'))}">${labels}${cells.join('')}</svg>`;
}
