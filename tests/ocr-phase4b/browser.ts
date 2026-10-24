// FASE 4B browser-only OCR execution: no registration or Supabase imports.
// This file runs the real production recognizer/parser against admitted PNGs.
import { createRecognizer } from '../../src/ocr/engine';
import { readCapture } from '../../src/ocr/readCapture';
import { evaluatePhase4B, type Phase4BOracle } from './score';

let reader: Awaited<ReturnType<typeof createRecognizer>> | undefined;

export async function start() {
  if (reader) throw new Error('OCR reader already started');
  const begun = performance.now();
  reader = await createRecognizer();
  return {
    initializationMs: performance.now() - begun,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

export async function runImage(path: string, expected: Phase4BOracle) {
  if (!reader) throw new Error('Call start() before runImage()');
  if (!/^\/tests\/ocr-phase4a\/images\/[a-z-]+\/[a-z0-9-]+\.png$/.test(path))
    throw new Error('Unapproved fixture path');
  const response = await fetch(path);
  if (!response.ok) throw new Error('Could not read reviewed fixture: ' + response.status);
  const image = await response.blob();
  const traces: unknown[] = [];
  let reads = 0;
  const actualReader = reader;
  const observedReader = {
    terminate: () => actualReader.terminate(),
    async recognize(...args: Parameters<typeof actualReader.recognize>) {
      reads++;
      const result = await actualReader.recognize(...args);
      traces.push({
        text: result.text,
        confidence: result.confidence,
        lines: result.lines,
        symbols: result.symbols,
      });
      return result;
    },
  };
  const started = performance.now();
  const parsed = await readCapture(observedReader, image, () => {});
  const durationMs = performance.now() - started;
  return {
    parsed,
    quality: evaluatePhase4B(expected, parsed),
    recognitionMs: durationMs,
    reads,
    traces,
  };
}

export async function stop() {
  if (!reader) return;
  const existing = reader;
  reader = undefined;
  await existing.terminate();
}
