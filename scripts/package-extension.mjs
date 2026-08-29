import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const output = path.join(distDir, "Paper_Mind-extension.zip");

const files = [];

async function walk(dir) {
  for (const name of await readdir(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) await walk(full);
    else files.push(full);
  }
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}

function dosTime(date = new Date()) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
  const day = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, day };
}

function header(signature, fields, name, extra = Buffer.alloc(0), comment = Buffer.alloc(0)) {
  const nameBuffer = Buffer.from(name);
  const buffer = Buffer.alloc(signature === 0x04034b50 ? 30 : 46);
  let offset = 0;
  buffer.writeUInt32LE(signature, offset); offset += 4;
  for (const [size, value] of fields) {
    if (size === 2) buffer.writeUInt16LE(value, offset);
    else buffer.writeUInt32LE(value, offset);
    offset += size;
  }
  if (signature === 0x04034b50) {
    buffer.writeUInt16LE(nameBuffer.length, 26);
    buffer.writeUInt16LE(extra.length, 28);
  } else {
    buffer.writeUInt16LE(nameBuffer.length, 28);
    buffer.writeUInt16LE(extra.length, 30);
    buffer.writeUInt16LE(comment.length, 32);
  }
  return Buffer.concat([buffer, nameBuffer, extra, comment]);
}

await mkdir(distDir, { recursive: true });
await walk(extensionDir);

const chunks = [];
const central = [];
let offset = 0;

for (const file of files) {
  const data = await import("node:fs/promises").then((fs) => fs.readFile(file));
  const compressed = zlib.deflateRawSync(data);
  const checksum = crc32(data);
  const { time, day } = dosTime();
  const name = path.relative(extensionDir, file).split(path.sep).join("/");
  const local = header(
    0x04034b50,
    [
      [2, 20],
      [2, 0],
      [2, 8],
      [2, time],
      [2, day],
      [4, checksum],
      [4, compressed.length],
      [4, data.length]
    ],
    name
  );
  chunks.push(local, compressed);
  central.push(
    header(
      0x02014b50,
      [
        [2, 20],
        [2, 20],
        [2, 0],
        [2, 8],
        [2, time],
        [2, day],
        [4, checksum],
        [4, compressed.length],
        [4, data.length],
        [2, 0],
        [2, 0],
        [2, 0],
        [2, 0],
        [2, 0],
        [4, 0],
        [4, offset]
      ],
      name
    )
  );
  offset += local.length + compressed.length;
}

const centralOffset = offset;
const centralBuffer = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuffer.length, 12);
end.writeUInt32LE(centralOffset, 16);

await writeFile(output, Buffer.concat([...chunks, centralBuffer, end]));
console.log(output);

