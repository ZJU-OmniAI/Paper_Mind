// Small ZIP writer for the release-material bundle; UTF-8 names, DEFLATE, no ZIP64.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

export async function listFiles(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await listFiles(full));
    else if(entry.isFile())files.push(full);
  }
  return files.sort();
}

function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (~crc)>>>0;
}

export async function writeZip(directory,output){
  const files=await listFiles(directory);
  if(files.length>=65535)throw new Error('ZIP64 required');
  const local=[],central=[];let offset=0;
  for(const file of files){
    const data=await readFile(file),packed=deflateRawSync(data),name=Buffer.from(path.relative(directory,file).split(path.sep).join('/'));
    const date=(await stat(file)).mtime;
    const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
    const day=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    const crc=crc32(data),h=Buffer.alloc(30),c=Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);
    h.writeUInt16LE(time,10);h.writeUInt16LE(day,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);
    c.writeUInt16LE(time,12);c.writeUInt16LE(day,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
    local.push(h,name,packed);central.push(c,name);offset+=h.length+name.length+packed.length;
    if(offset>=0xffffffff)throw new Error('ZIP64 required');
  }
  const directoryBuffer=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directoryBuffer.length,12);end.writeUInt32LE(offset,16);
  await writeFile(output,Buffer.concat([...local,directoryBuffer,end]));
}
