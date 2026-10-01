// "default" leaves the choice to the CLI; all other values are passed explicitly.
export const EFFORTS = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
};
export function validatedEffort(provider, value = 'default') {
  if (value !== 'default' && !EFFORTS[provider]?.includes(value)) throw new Error('无效 effort / Invalid effort');
  return value;
}
export function fallbackModels(provider) {
  return provider === 'claude' ? ['sonnet', 'opus', 'haiku'].map(id => ({ id, label: id })) : [];
}
export function modelEfforts(provider, model, catalog) {
  // Do not infer the model used by an unspecified CLI default or a custom ID.
  return catalog?.models?.find(item => item.id === model)?.efforts ?? EFFORTS[provider];
}
