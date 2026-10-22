import encode, { init } from '@jsquash/webp/encode';
import wasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import simd from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

self.onmessage = async ({ data: blob }: MessageEvent<Blob>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    if (width * height > 16_000_000 || width > 16383 || height > 16383)
      return self.postMessage({ blob, width, height });
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    await init({ locateFile: (name: string) => name.includes('simd') ? simd : wasm });
    const pixels = ctx.getImageData(0, 0, width, height);
    const bytes = await encode(pixels, {
      lossless: 1, exact: 1, near_lossless: 100, quality: 75, method: 3,
    });
    const candidate = new Blob([bytes], { type: 'image/webp' });
    let result = blob;
    if (candidate.size < blob.size * 0.95) {
      // Alpha/color-profile conversion can change browser-decoded pixels even
      // with lossless encoding. Keep the original if round-trip pixels differ.
      const decoded = await createImageBitmap(candidate);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(decoded, 0, 0); decoded.close();
      const roundTrip = ctx.getImageData(0, 0, width, height).data;
      if (pixels.data.every((value, index) => value === roundTrip[index])) result = candidate;
    }
    self.postMessage({ blob: result, width, height });
  } catch {
    // Optimization is optional: a valid original can still be uploaded.
    self.postMessage({ blob });
  } finally { bitmap?.close(); }
};
