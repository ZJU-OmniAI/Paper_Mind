import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, writeZip } from './store/zip.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const manifest=await json('extension/manifest.json'),pkg=await json('package.json'),fields=await json('docs/store/fields.json'),permissions=await json('docs/store/permissions.json');
assert.equal(manifest.version,pkg.version,'Package/manifest version differs');
assert.equal(fields.preparedForVersion,manifest.version,'Update store fields for this version');
assert.equal(fields.defaultLocale,manifest.default_locale);
assert.deepEqual(Object.keys(permissions).sort(),[...manifest.permissions,...manifest.host_permissions].sort(),'Permission explanations must exactly match the manifest');
const imageChecks=[];
async function checkPng(file,width,height,transparent=false){
  const png=await readFile(path.join(root,file));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file);
  assert.equal(png.readUInt32BE(16),width,file+' width');assert.equal(png.readUInt32BE(20),height,file+' height');
  assert.equal(png[24],8,file+' depth');assert.equal(png[25],transparent?6:2,file+' RGB/alpha format');
  imageChecks.push({file,width,height,format:transparent?'RGBA PNG':'RGB PNG'});
}
for(const [locale,listing] of Object.entries(fields.locales)){
 const messages=await json(`extension/_locales/${locale}/messages.json`);
 assert.equal(messages.extName.message,fields.name);assert.equal(messages.extDescription.message,listing.shortDescription);
 assert.ok(listing.shortDescription.length<=132,'Short description exceeds 132 characters');
 assert.equal(listing.screenshots.length,5);
 const description=await readFile(path.join(root,listing.descriptionFile),'utf8');
 assert.ok(description.length>300&&description.length<16000,'Description length');
 for(const file of listing.screenshots)await checkPng('assets/store/'+file,1280,800);
}
await checkPng(fields.icon,128,128,true);await checkPng(fields.smallPromoTile,440,280);await checkPng(fields.marqueePromoTile,1400,560);
for(const lang of ['zh','en']){
 const fixture=await json(`docs/store/reviewer-library-${lang}.json`);
 assert.equal(fixture.format,'paper-mind-store');assert.equal(fixture.store.papers.length,9);
 const agent=fixture.store.papers.filter(p=>p.tagIds.includes('agent'));
 assert.equal(agent.length,3);assert.equal(agent.filter(p=>p.tagIds.includes('eval')).length,2);
 assert.ok(!/apiKey|bridgeToken/i.test(JSON.stringify(fixture)),'Fixture must not contain credentials/settings');
}
await import('./package-extension.mjs');
const kitName=`store-kit-${manifest.version}`,kit=path.join(root,'dist',kitName);
// Remove only this script's version-specific generated directory, never user data.
await rm(kit,{recursive:true,force:true});await mkdir(kit,{recursive:true});
const sources=['PRIVACY.md','PRIVACY_zh.md','LICENSE','docs/store-listing.md','docs/publishing.md','docs/local-models.md'];
for(const dir of ['docs/store','assets/store'])sources.push(...(await listFiles(path.join(root,dir))).map(file=>path.relative(root,file)));
for(const lang of ['zh','en'])for(const extension of ['mp4','srt'])sources.push(`assets/videos/paper-mind-intro-${lang}.${extension}`);
for(const source of sources){const destination=path.join(kit,source);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(root,source),destination);}
await copyFile(path.join(root,'dist/Paper_Mind-extension.zip'),path.join(kit,'Paper_Mind-extension.zip'));
const report={version:manifest.version,createdAt:new Date().toISOString(),validation:'Package/material consistency checks only; not store approval or a live model test',permissionEntries:Object.keys(permissions).length,images:imageChecks,reviewerFixtureCounts:[9,3,2]};
await writeFile(path.join(kit,'package-report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(kit,'START-HERE.md'),`# Paper_Mind ${manifest.version} 商店材料包\n\n上传扩展时只选择根目录的 **Paper_Mind-extension.zip**。不要上传这个材料总包。\n\n1. 阅读 [提交材料索引](docs/store-listing.md)。\n2. 中英文文案见 docs/store/listing-*.txt；图片见 assets/store。\n3. 权限、隐私表单与审核步骤见 docs/store；示例库导入会替换当前库，请使用新 Chrome 配置。\n4. assets/videos 包含两种配音的现有视频及字幕。商店视频字段需另行提供 YouTube URL。\n5. 账号身份、验证邮箱、分发范围、隐私认证和最终提交仍由发布者完成。\n\n本包不含 API Key、桥接连接码或个人论文库。SHA256SUMS.txt 列出包内文件校验值（清单本身除外）。package-report.json 记录构建检查，不代表审核通过。\n\nSource: https://github.com/ZJU-OmniAI/Paper_Mind\n`);
const hashes=[];
for(const file of await listFiles(kit))hashes.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${path.relative(kit,file).split(path.sep).join('/')}`);
await writeFile(path.join(kit,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
const output=path.join(root,`dist/Paper_Mind-Chrome-Web-Store-kit-${manifest.version}.zip`);
await writeZip(kit,output);
const digest=createHash('sha256').update(await readFile(output)).digest('hex');
await writeFile(output+'.sha256',`${digest}  ${path.basename(output)}\n`);
console.log(`Validated ${imageChecks.length} PNG assets, ${Object.keys(permissions).length} permission explanations and both reviewer fixtures.\n${output}`);
