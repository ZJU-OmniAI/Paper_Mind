// Local, model-free views over a saved topic synthesis: the paper × design
// dimension matrix, pairwise design similarity and a similarity-based order.
// Everything here is derived from validated groups and commonalities only.
const array = value => Array.isArray(value) ? value : [];

// cells.get(paperId)[d] is the group index the paper takes in dimension d, or -1
// when the synthesis did not compare that paper on that dimension.
export function designMatrix(result, paperIds) {
  const known = new Set(paperIds);
  const dimensions = array(result?.differences).map((dimension, index) => ({
    index, dimension,
    groups: array(dimension.groups).map(group => ({ ...group, paperIds: [...new Set(array(group.paperIds))].filter(id => known.has(id)) }))
  }));
  const cells = new Map(paperIds.map(id => [id, dimensions.map(item => item.groups.findIndex(group => group.paperIds.includes(id)))]));
  const coverage = dimensions.map(item => paperIds.filter(id => cells.get(id)[item.index] >= 0).length);
  return { dimensions, cells, coverage };
}

// Jaccard overlap of each paper's design traits: the group it chose in every
// compared dimension, plus each shared foundation it belongs to.
export function designSimilarity(result, paperIds) {
  const matrix = designMatrix(result, paperIds);
  const commonalities = array(result?.commonalities);
  const traits = new Map(paperIds.map(id => [id, new Set([
    ...matrix.cells.get(id).flatMap((group, dimension) => group >= 0 ? [`d${dimension}:${group}`] : []),
    ...commonalities.flatMap((item, index) => array(item.paperIds).includes(id) ? [`c${index}`] : [])
  ])]));
  const pair = (a, b) => {
    const left = traits.get(a), right = traits.get(b);
    let shared = 0;
    for (const trait of left) if (right.has(trait)) shared++;
    const union = left.size + right.size - shared;
    const cellsA = matrix.cells.get(a), cellsB = matrix.cells.get(b);
    let compared = 0, same = 0;
    cellsA.forEach((group, dimension) => { if (group >= 0 && cellsB[dimension] >= 0) { compared++; if (group === cellsB[dimension]) same++; } });
    const foundations = commonalities.filter(item => array(item.paperIds).includes(a) && array(item.paperIds).includes(b)).length;
    return { value: union ? shared / union : 0, compared, same, foundations, known: union > 0 };
  };
  const values = new Map();
  for (const a of paperIds) for (const b of paperIds) if (a !== b && !values.has(`${b}\n${a}`)) values.set(`${a}\n${b}`, pair(a, b));
  const get = (a, b) => a === b ? { value: 1, compared: 0, same: 0, foundations: 0, known: true } : values.get(`${a}\n${b}`) || values.get(`${b}\n${a}`);
  return { ids: [...paperIds], get, matrix };
}

// Average-linkage agglomerative clustering; returns the leaf order so similar
// papers sit next to each other. Ties keep the original order for stability.
export function similarityOrder(similarity) {
  const ids = similarity.ids;
  if (ids.length < 3) return [...ids];
  let clusters = ids.map((id, index) => ({ members: [id], order: [id], first: index }));
  const linkage = (a, b) => {
    let total = 0;
    for (const x of a.members) for (const y of b.members) total += similarity.get(x, y).value;
    return total / (a.members.length * b.members.length);
  };
  while (clusters.length > 1) {
    let best = null;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const score = linkage(clusters[i], clusters[j]);
      if (!best || score > best.score + 1e-9) best = { i, j, score };
    }
    const a = clusters[best.i], b = clusters[best.j];
    // Join the closer ends of the two chains so neighbours stay adjacent.
    const options = [[a.order, b.order], [a.order, [...b.order].reverse()], [[...a.order].reverse(), b.order], [[...a.order].reverse(), [...b.order].reverse()]];
    const score = ([left, right]) => similarity.get(left.at(-1), right[0]).value;
    const [left, right] = options.reduce((chosen, option) => score(option) > score(chosen) + 1e-9 ? option : chosen, options[0]);
    const merged = { members: [...a.members, ...b.members], order: [...left, ...right], first: Math.min(a.first, b.first) };
    clusters = clusters.filter((_, index) => index !== best.i && index !== best.j).concat(merged).sort((x, y) => x.first - y.first);
  }
  return clusters[0].order;
}

// The most and least alike pairs among papers that were actually compared.
export function notablePairs(similarity, limit = 3) {
  const pairs = [];
  similarity.ids.forEach((a, i) => similarity.ids.slice(i + 1).forEach(b => {
    const item = similarity.get(a, b);
    if (item.compared || item.foundations) pairs.push({ a, b, ...item });
  }));
  const closest = [...pairs].sort((x, y) => y.value - x.value || y.same - x.same).slice(0, limit).filter(item => item.value > 0);
  const furthest = [...pairs].filter(item => item.compared).sort((x, y) => (x.same / x.compared) - (y.same / y.compared) || x.value - y.value).slice(0, limit)
    .filter(item => item.same < item.compared && !closest.some(other => other.a === item.a && other.b === item.b));
  return { closest, furthest };
}

// Papers sharing exactly the same short choice in a comparison row share a hue.
export function choiceGroups(cells) {
  const keys = new Map();
  return cells.map(cell => {
    const key = String(cell?.choice || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key) return -1;
    if (!keys.has(key)) keys.set(key, keys.size);
    return keys.get(key);
  });
}
