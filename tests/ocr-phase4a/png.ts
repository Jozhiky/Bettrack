// Test-only lossless decoding for this reviewed RGB/RGBA8, non-interlaced batch.
// No image generation, OCR, filesystem writes or external services.
import { crc32, inflateSync } from 'node:zlib';

export function decodedPixels(bytes: Buffer) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG signature');
  const allowed = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']);
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk');
    const size = bytes.readUInt32BE(offset);
    const end = offset + size + 12;
    if (end > bytes.length) throw new Error('Truncated PNG payload');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!allowed.has(type)) throw new Error('Disallowed PNG metadata');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4))
      throw new Error('PNG CRC mismatch');
    chunks.push({ type, data: bytes.subarray(offset + 8, end - 4) });
    offset = end;
  }
  if (
    chunks[0]?.type !== 'IHDR' ||
    chunks.at(-1)?.type !== 'IEND' ||
    chunks.filter((c) => c.type === 'IHDR').length !== 1 ||
    chunks.filter((c) => c.type === 'IEND').length !== 1 ||
    chunks.at(-1)!.data.length !== 0
  )
    throw new Error('PNG structure');
  const header = chunks[0].data;
  if (
    header.length !== 13 ||
    header[8] !== 8 ||
    ![2, 6].includes(header[9]) ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0 ||
    chunks.some((c) => c.type === 'tRNS')
  )
    throw new Error('Unsupported PNG encoding for pixel comparison; review separately');
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4);
  if (!width || !height || width * height > 16_000_000) throw new Error('PNG dimensions');
  const channels = header[9] === 6 ? 4 : 3;
  const stride = width * channels;
  const data = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)),
    { maxOutputLength: (stride + 1) * height },
  );
  if (data.length !== (stride + 1) * height) throw new Error('PNG pixel length');
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    if (filter > 4) throw new Error('PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= channels ? raw[at - channels] : 0;
      const b = y ? raw[at - stride] : 0;
      const c = y && x >= channels ? raw[at - stride - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
      raw[at] = (data[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    raw.copy(rgba, i * 4, i * channels, i * channels + 3);
    rgba[i * 4 + 3] = channels === 4 ? raw[i * 4 + 3] : 255;
  }
  return { width, height, rgba };
}
