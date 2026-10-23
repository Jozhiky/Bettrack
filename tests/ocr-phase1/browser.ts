import { createTiming } from './timing';
import { evaluate, type ExpectedTicket } from './quality';
import { probes } from './controlled';
import type { ParsedTicket } from '../../src/ocr/parser';
import type { createRecognizer } from '../../src/ocr/engine';

declare global {
  var __phase1: ReturnType<typeof createTiming>;
}
const timing = (globalThis.__phase1 = createTiming());
// Replace browser persistence before importing Dexie or any repository.
const fake = await import('fake-indexeddb');
Object.defineProperty(globalThis, 'indexedDB', {
  value: new fake.IDBFactory(),
  configurable: true,
});
Object.defineProperty(globalThis, 'IDBKeyRange', { value: fake.IDBKeyRange, configurable: true });
const { BettrackDB } = await import('../../src/data/db');
const { LocalRepository } = await import('../../src/data/repository');
const { registerCapture } = await import('../../src/data/captures');
const { betSchema, selectionSchema } = await import('../../src/domain/model');
const { parseTicket } = await import('../../src/ocr/parser');
const { readCapture } = await import('../../src/ocr/readCapture');
const { createRecognizer: createReader } = await import('../../src/ocr/engine');

// Time the actual Zod calls, including calls made by completeness/register/save.
for (const schema of [betSchema, selectionSchema]) {
  for (const method of ['parse', 'safeParse'] as const) {
    const original = schema[method].bind(schema);
    Object.defineProperty(schema, method, {
      configurable: true,
      value: (...args: Parameters<typeof original>) =>
        timing.sync('validation', () => Reflect.apply(original, undefined, args)),
    });
  }
}

async function registration(parsed: ParsedTicket, blob: Blob) {
  const db = new BettrackDB(`phase1-memory-${crypto.randomUUID()}`);
  try {
    const repository = new LocalRepository(db);
    await repository.init();
    await db.images.add({ id: 'image', name: 'fixture.png', hash: 'fixture-hash', blob });
    await db.uploads.add({
      id: 'fixture',
      imageId: 'image',
      createdAt: '2026-01-01T12:00:00.000Z',
      status: 'queued',
      progress: 0,
      draftJson: '',
      reason: '',
    });
    await timing.async('registration', () => registerCapture('fixture', parsed, repository));
    return {
      status: (await db.uploads.get('fixture'))?.status,
      bets: await db.bets.count(),
      movements: await db.movements.count(),
      settlements: await db.settlements.count(),
      backend: 'fake-indexeddb in RAM; no Supabase latency',
    };
  } finally {
    await db.delete();
  }
}

let reader: Awaited<ReturnType<typeof createRecognizer>>;
export async function start() {
  const begin = performance.now();
  reader = await createReader();
  return {
    workerInitializationMs: performance.now() - begin,
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  };
}
export async function stop() {
  await reader?.terminate();
}

// Fault injection changes OCR evidence only in this harness, never image pixels
// or production code. Both faults use a real image but are NOT real OCR outcomes.
type Fault = 'missing-odds' | 'unknown-market';
export async function runImage(image: string, expected: ExpectedTicket, fault?: Fault) {
  const blob = await (await fetch(image)).blob();
  timing.reset();
  let reads = 0;
  const traces: unknown[] = [];
  const measuringReader = {
    terminate: () => reader.terminate(),
    async recognize(...args: Parameters<typeof reader.recognize>) {
      reads++;
      const result = await reader.recognize(...args);
      if (fault) {
        const maxX = Math.max(...result.lines.flatMap((l) => l.words.map((w) => w.bbox.x1)));
        if (fault === 'missing-odds') {
          result.lines = result.lines
            .map((l) => ({
              ...l,
              words: l.words.filter((w) => !(w.text === '1.33' && w.bbox.x0 > maxX * 0.8)),
            }))
            .filter((l) => l.words.length)
            .map((l) => ({ ...l, text: l.words.map((w) => w.text).join(' ') }));
        } else {
          const target = result.lines.find((l) => /h[aá]ndicap resultado/i.test(l.text));
          if (!target) throw new Error('Fault target not found; do not silently skip probe');
          const text = 'Mercado experimental no catalogado';
          target.text = text;
          target.words = [{ text, confidence: 95, bbox: { ...target.bbox } }];
        }
        result.text = result.lines.map((l) => l.text).join('\n');
      }
      traces.push(structuredClone(result));
      return result;
    },
  };
  const begin = performance.now();
  const parsed = await readCapture(measuringReader, blob, () => {});
  const recognitionMs = performance.now() - begin;
  const registered = await registration(parsed, blob);
  const metrics = timing.summary();
  return {
    parsed,
    quality: evaluate(expected, parsed),
    registered,
    metrics,
    reads,
    recognitionMs,
    traces,
  };
}

export async function runProbes() {
  const results = [];
  for (const probe of probes) {
    timing.reset();
    const parsed = parseTicket('', structuredClone(probe.lines));
    const registered = await registration(parsed, new Blob(['controlled-layout']));
    results.push({
      id: probe.id,
      provenance: 'hand-authored-layout-not-ocr',
      knownFailure: probe.knownFailure,
      quality: evaluate(probe.expected, parsed),
      parsed,
      registered,
      metrics: timing.summary(),
    });
  }
  return results;
}
