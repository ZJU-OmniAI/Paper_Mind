import test from 'node:test';
import assert from 'node:assert/strict';
import { arxivIdFromUrl, cleanPaperTitle, doiFromUrl, isPaperHost, isProjectHost, isWeakTitle, landingPageFromUrl, resolvePaperSource } from '../extension/paper-source.js';

const READER = 'chrome-extension://acafiedlcaibhilacmadmiklkfhmlhjo/reader/reader.html';

test('PDF reader pages resolve to the paper they wrap, and local files keep the reader address', () => {
  const arxiv = resolvePaperSource(`${READER}?id=2405.19209v2`);
  assert.equal(arxiv.url, 'https://arxiv.org/abs/2405.19209');
  assert.equal(arxiv.arxivId, '2405.19209');
  assert.equal(arxiv.reader, true);
  assert.equal(resolvePaperSource(`${READER}?id=hep-th/9901001`).arxivId, 'hep-th/9901001');
  const openreview = resolvePaperSource(`${READER}?url=${encodeURIComponent('https://openreview.net/pdf?id=YicbFdNTTy')}#page=3`);
  assert.equal(openreview.url, 'https://openreview.net/pdf?id=YicbFdNTTy');
  assert.equal(openreview.openreviewId, 'YicbFdNTTy');
  assert.equal(openreview.landingUrl, 'https://openreview.net/forum?id=YicbFdNTTy');
  const local = resolvePaperSource(`${READER}?local=local%3A${'a'.repeat(64)}`);
  assert.equal(local.local, true);
  assert.equal(local.url, `${READER}?local=local%3A${'a'.repeat(64)}`);
  assert.equal(resolvePaperSource(`${READER}?url=${encodeURIComponent('file:///Users/me/paper.pdf')}`).local, true);
  // PDF.js 插件把原地址拼在扩展路径后面，或放在 ?file=
  assert.equal(resolvePaperSource('chrome-extension://oemmndcbldboiebfnladdacbdfmadadm/https://arxiv.org/pdf/1706.03762v7').url, 'https://arxiv.org/abs/1706.03762');
  assert.equal(resolvePaperSource(`chrome-extension://x/content/web/viewer.html?file=${encodeURIComponent('https://aclanthology.org/N19-1423.pdf')}`).landingUrl, 'https://aclanthology.org/N19-1423/');
  assert.equal(resolvePaperSource('chrome-extension://x/reader/reader.html').url, 'chrome-extension://x/reader/reader.html');
});

test('arXiv identifiers are read from paper-site paths only', () => {
  for (const url of [
    'https://arxiv.org/abs/2405.19209', 'https://arxiv.org/pdf/2405.19209v3', 'https://arxiv.org/pdf/2405.19209v3.pdf', 'https://arxiv.org/html/2405.19209v2/',
    'https://export.arxiv.org/abs/2405.19209', 'https://www.alphaxiv.org/abs/2405.19209?chatId=1', 'https://www.alphaxiv.org/overview/2405.19209',
    'https://www.alphaxiv.org/pdf/2405.19209v1', 'https://huggingface.co/papers/2405.19209', 'https://ar5iv.labs.arxiv.org/html/2405.19209',
    'https://papers.cool/arxiv/2405.19209', 'https://www.emergentmind.com/papers/2405.19209', 'https://doi.org/10.48550/arXiv.2405.19209'
  ]) assert.equal(arxivIdFromUrl(url), '2405.19209', url);
  assert.equal(arxivIdFromUrl('https://evil.test/arxiv.org/abs/2405.19209'), '');
  assert.equal(arxivIdFromUrl('https://www.alphaxiv.org/pdf/41c1ae62-af3f-4a8a-8d0c-2cee05465ac2'), '');
  assert.equal(arxivIdFromUrl('https://example.org/?arxiv=2405.19209'), '');
  // 普通网页上 ?id= 不是 arXiv 编号；只有扩展的阅读器页面才这样传
  assert.equal(resolvePaperSource('https://example.org/view?id=2405.19209').arxivId, '');
});

test('DOIs come from publisher paths, PDF links map to landing pages', () => {
  assert.equal(doiFromUrl('https://dl.acm.org/doi/pdf/10.1145/3065386'), '10.1145/3065386');
  assert.equal(doiFromUrl('https://www.science.org/doi/full/10.1126/science.aar6404'), '10.1126/science.aar6404');
  assert.equal(doiFromUrl('https://www.nature.com/articles/s41586-021-03819-2.pdf'), '10.1038/s41586-021-03819-2');
  assert.equal(doiFromUrl('https://www.biorxiv.org/content/10.1101/2022.07.20.500902v1.full.pdf'), '10.1101/2022.07.20.500902');
  assert.equal(doiFromUrl('https://link.springer.com/content/pdf/10.1007/s11263-015-0816-y.pdf'), '10.1007/s11263-015-0816-y');
  assert.equal(doiFromUrl('https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123456'), '10.1371/journal.pone.0123456');
  assert.equal(doiFromUrl('https://example.org/?reference=10.1234/wrong'), '');
  assert.equal(doiFromUrl('https://doi.org/10.48550/arXiv.2405.19209'), '');
  const landing = url => landingPageFromUrl(url).landingUrl;
  assert.equal(landing('https://proceedings.neurips.cc/paper_files/paper/2023/file/0123456789abcdef0123456789abcdef-Paper-Conference.pdf'), 'https://proceedings.neurips.cc/paper_files/paper/2023/hash/0123456789abcdef0123456789abcdef-Abstract-Conference.html');
  assert.equal(landing('https://openaccess.thecvf.com/content/CVPR2024/papers/Doe_Title_CVPR_2024_paper.pdf'), 'https://openaccess.thecvf.com/content/CVPR2024/html/Doe_Title_CVPR_2024_paper.html');
  assert.equal(landing('https://proceedings.mlr.press/v139/radford21a/radford21a.pdf'), 'https://proceedings.mlr.press/v139/radford21a.html');
  assert.equal(landing('https://jmlr.org/papers/volume15/srivastava14a/srivastava14a.pdf'), 'https://jmlr.org/papers/v15/srivastava14a.html');
  assert.equal(landing('https://www.ijcai.org/proceedings/2023/0001.pdf'), 'https://www.ijcai.org/proceedings/2023/1');
  assert.equal(landing('https://ojs.aaai.org/index.php/AAAI/article/download/25070/24842'), 'https://ojs.aaai.org/index.php/AAAI/article/view/25070');
  assert.equal(landing('https://www.roboticsproceedings.org/rss20/p001.pdf'), 'https://www.roboticsproceedings.org/rss20/p001.html');
  assert.equal(landing('https://aclanthology.org/2024.acl-long.1.pdf'), 'https://aclanthology.org/2024.acl-long.1/');
  assert.deepEqual(landingPageFromUrl('https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=07780459'), { landingUrl: 'https://ieeexplore.ieee.org/document/7780459', openreviewId: '', ieeeNumber: '7780459' });
});

test('titles lose site and reader decorations; placeholders are recognised without hurting real titles', () => {
  assert.equal(cleanPaperTitle('VIDEOTREE: Adaptive Trees · LLM_in_PDF'), 'VIDEOTREE: Adaptive Trees');
  assert.equal(cleanPaperTitle('[2405.19209] VideoTree: Adaptive Trees'), 'VideoTree: Adaptive Trees');
  assert.equal(cleanPaperTitle('[CVPR 2025] VideoTree: Adaptive Trees'), 'VideoTree: Adaptive Trees');
  assert.equal(cleanPaperTitle('Paper page - DeepSeek-R1: Incentivizing Reasoning'), 'DeepSeek-R1: Incentivizing Reasoning');
  assert.equal(cleanPaperTitle('Deep Residual Learning for Image Recognition | IEEE Conference Publication | IEEE Xplore'), 'Deep Residual Learning for Image Recognition');
  assert.equal(cleanPaperTitle('Deep learning | Nature'), 'Deep learning');
  assert.equal(cleanPaperTitle('ImageNet classification with deep convolutional neural networks | Communications of the ACM'), 'ImageNet classification with deep convolutional neural networks');
  assert.equal(cleanPaperTitle('Attention Is All You Need\n  | alphaXiv'), 'Attention Is All You Need');
  for (const weak of ['arXiv:2405.19209 · LLM_in_PDF', '2405.19209v3.pdf', 'main.pdf', 'Verifying your browser', 'Just a moment...', 'Are you a robot?', 'dl.acm.org', '404 – Hugging Face', 'Microsoft Word - final.docx', '']) {
    assert.equal(isWeakTitle(weak), true, weak);
  }
  for (const real of ['Error-Correcting Output Codes', 'One More Step: Long-Horizon Planning', 'GPT-4.5', 'VideoClaw', 'Not All Tokens Are What You Need']) {
    assert.equal(isWeakTitle(real), false, real);
  }
});

test('paper and project hosts are recognised by hostname, not by path text', () => {
  assert.equal(isPaperHost('https://openaccess.thecvf.com/content/CVPR2024/html/x.html'), true);
  assert.equal(isPaperHost('https://mp.weixin.qq.com/s/abc'), false);
  assert.equal(isPaperHost('https://evil.test/arxiv.org/abs/1'), false);
  assert.equal(isProjectHost('https://videotree2024.github.io/'), true);
  assert.equal(isProjectHost('https://github.com/Ziyang412/VideoTree'), true);
  assert.equal(isProjectHost('https://arxiv.org/abs/2405.19209'), false);
});
