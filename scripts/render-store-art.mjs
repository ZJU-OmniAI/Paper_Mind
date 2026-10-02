// Code-native promotional artwork. No external fonts, images or network requests.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'assets/store');
await mkdir(output,{recursive:true});
const logo=(await readFile(path.join(root,'assets/logo.png'))).toString('base64');
const definitions=`<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#073d39"/><stop offset="1" stop-color="#096f63"/></linearGradient><filter id="shadow"><feDropShadow dy="9" stdDeviation="10" flood-opacity=".14"/></filter></defs>`;
const paper=`<g filter="url(#shadow)"><rect width="130" height="151" rx="15" fill="#fbfdf7"/><rect x="18" y="19" width="32" height="32" rx="8" fill="#d6eee4"/><path d="M27 28h14m-14 7h10m-10 7h14" stroke="#258475" stroke-width="3" stroke-linecap="round"/><path d="M18 72h92M18 83h77M18 98h92M18 109h58" stroke="#bfd7cd" stroke-width="5" stroke-linecap="round"/><rect x="18" y="125" width="35" height="9" rx="4" fill="#32a68f"/><rect x="59" y="125" width="43" height="9" rx="4" fill="#c4e4d6"/></g>`;
const tags=`<path d="M130 75h31m0-48v96m0-96h24m-24 48h24m-24 48h24" fill="none" stroke="#71bba5" stroke-width="2"/><g font-family="Arial,sans-serif" font-size="17" font-weight="700"><rect x="185" y="9" width="113" height="36" rx="18" fill="#d9f1e7"/><text x="204" y="33" fill="#166b5c"># Agent</text><rect x="185" y="57" width="113" height="36" rx="18" fill="#fbebbf"/><text x="204" y="81" fill="#72623c"># OPD</text><rect x="185" y="105" width="113" height="36" rx="18" fill="#d4e9ed"/><text x="204" y="129" fill="#2b6570"># Team</text></g>`;
const art=(width,height,content)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${definitions}<rect width="100%" height="100%" fill="url(#bg)"/><circle cx="${width*.9}" cy="${height*.1}" r="${height*.8}" fill="#90dec1" opacity=".06"/>${content}</svg>`;
const small=art(440,280,`<image href="data:image/png;base64,${logo}" x="31" y="27" width="33" height="33"/><text x="76" y="53" fill="#f5fff5" font-size="30" font-weight="700" font-family="Arial,sans-serif" letter-spacing="-1">Paper_Mind</text><g transform="translate(52 97)">${paper}${tags}</g>`);
const large=art(1400,560,`<image href="data:image/png;base64,${logo}" x="88" y="180" width="67" height="67"/><text x="88" y="332" fill="#f5fff5" font-size="77" font-weight="700" font-family="Arial,sans-serif" letter-spacing="-3">Paper_Mind</text><g transform="translate(743 131) scale(1.85)">${paper}${tags}</g>`);
const browser=await chromium.launch({channel:process.env.PW_CHANNEL||undefined});
try{
 const page=await browser.newPage({deviceScaleFactor:1});
 await page.route('**/*',r=>r.abort());
 for(const [name,width,height,svg] of [['promo-small',440,280,small],['promo-marquee',1400,560,large]]){
  await writeFile(path.join(output,name+'.svg'),svg+'\n');
  await page.setViewportSize({width,height});
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('svg').screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
 }
 // Store icon: the existing identity, with the recommended 16px transparent margin.
 await page.setViewportSize({width:128,height:128});
 await page.setContent(`<style>body{margin:0;background:transparent}img{position:absolute;left:16px;top:16px;width:96px;height:96px}</style><img src="data:image/png;base64,${logo}">`);
 await page.evaluate(async()=>Promise.all([...document.images].map(img=>img.decode())));
 await page.screenshot({path:path.join(output,'icon-128.png'),omitBackground:true});
 // Contact sheets are for review, not for the store's five screenshot slots.
 for(const lang of ['zh','en']){
  const images=await Promise.all(['01-capture','02-recall','03-refine','04-tags','05-models'].map(async name=>(await readFile(path.join(output,`${name}-${lang}.png`))).toString('base64')));
  await page.setViewportSize({width:1280,height:1240});
  await page.setContent(`<style>body{margin:0;padding:16px;background:#dce9e2;display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:616px;display:block}</style>${images.map(src=>`<img src="data:image/png;base64,${src}">`).join('')}`);
  await page.evaluate(async()=>Promise.all([...document.images].map(img=>img.decode())));
  await page.screenshot({path:path.join(root,`dist/store-work/contact-${lang}.png`)});
 }
 console.log('Rendered 440×280 and 1400×560 promo tiles, padded 128×128 icon and review contact sheets.');
}finally{await browser.close();}
