import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import corpus from '../../tests/ocr-phase1/cases.json';
import { evaluate, failureSignatures, type ExpectedTicket } from '../../tests/ocr-phase1/quality';
import { probes } from '../../tests/ocr-phase1/controlled';
import { createTiming } from '../../tests/ocr-phase1/timing';
import { parseTicket, type ParsedTicket } from '../ocr/parser';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from '../data/captures';

vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error('Cloud access forbidden in phase 1');
      },
    },
  ),
}));

const asParsed = (expected: ExpectedTicket): ParsedTicket => ({
  ...structuredClone(expected),
  selections: expected.selections.map((s) => ({
    ...structuredClone(s),
    sport: '',
    league: '',
  })) as ParsedTicket['selections'],
  warnings: [],
  confidence: {},
  text: '',
  expectedSelections: expected.selections.length,
});
const actualProbe = (probe: (typeof probes)[number]) =>
  parseTicket('', structuredClone(probe.lines));

describe('Phase 1 portable corpus and independent quality oracle', () => {
  it.each(corpus.cases)(
    '$id: pixels are immutable and PNG contains no textual/private metadata',
    (c) => {
      const bytes = readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          '../../tests/ocr-phase1',
          c.image,
        ),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(c.sha256);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const allowed = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM'];
      let offset = 8;
      while (offset < bytes.length) {
        expect(allowed).toContain(bytes.toString('ascii', offset + 4, offset + 8));
        offset += 12 + bytes.readUInt32BE(offset);
      }
      expect(offset).toBe(bytes.length);
      expect(c.privacy).toContain('sin titular');
      expect(evaluate(c.expected, asParsed(c.expected)).complete).toBe(true);
    },
  );
  it('contains no user email, original path, account UUID or private ticket id in labels', () => {
    const text = JSON.stringify(corpus);
    expect(text).not.toMatch(
      /@|[A-Z]:[\\/]|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    );
  });
  it('reports each required field independently', () => {
    const c = corpus.cases[0];
    const p = asParsed(c.expected);
    const q = evaluate(c.expected, p);
    for (const field of [
      'house',
      'kind',
      'stake',
      'odds',
      'potential',
      'event',
      'market',
      'pick',
    ]) {
      expect(q.fields[field].total).toBeGreaterThan(0);
      expect(q.fields[field].correct).toBe(q.fields[field].total);
    }
  });
  it('does not inflate quality by dropping absent legs or markets from its denominator', () => {
    const c = corpus.cases[1];
    const p = asParsed(c.expected);
    p.selections.pop();
    const q = evaluate(c.expected, p);
    expect(q.omittedLegs).toBe(1);
    expect(q.fields.event.total).toBe(2);
    expect(q.fields.market.total).toBe(9);
    expect(q.complete).toBe(false);
  });
  it('detects extra selections and extra builder children', () => {
    const c = corpus.cases[1];
    const p = asParsed(c.expected);
    p.selections.push(structuredClone(p.selections[0]));
    p.selections[0].builderMarkets!.push({ market: 'Duplicado', pick: 'Sí' });
    const q = evaluate(c.expected, p);
    expect(q.extraLegs).toBe(1);
    expect(q.failures.filter((f) => f.field === 'count')).toHaveLength(2);
  });
  it.each([
    ['first-half-corners', 'market', 'Córners totales Más/Menos'],
    ['first-half-corners', 'market', 'Goles en Primer Tiempo Más/Menos'],
    ['first-half-corners', 'pick', 'Menos de 4.5'],
    ['timed-goal', 'market', 'Próximo gol antes de 60:00 (Gol 5)'],
    ['timed-goal', 'pick', 'Gol después del minuto 70:00'],
    ['handicap-combination', 'event', 'Resultado del partido vs. América de Cali'],
  ])('detects meaning/role change: %s %s → %s', (id, field, replacement) => {
    const c = corpus.cases.find((c) => c.id === id)!;
    const p = asParsed(c.expected);
    p.selections[0][field as 'event' | 'market' | 'pick'] = replacement;
    expect(evaluate(c.expected, p).failures.some((f) => f.field === field)).toBe(true);
  });
  it('detects losing a handicap sign', () => {
    const c = corpus.cases.find((c) => c.id === 'handicap-combination')!;
    const p = asParsed(c.expected);
    p.selections[1].pick = 'Club Tijuana -3';
    expect(evaluate(c.expected, p).fields.pick.wrong).toBe(1);
  });
  it('detects shots on target becoming total shots, and 1+ becoming 1', () => {
    const c = corpus.cases[1];
    const p = asParsed(c.expected);
    p.selections[0].builderMarkets![0] = {
      market: 'Nico Paz Remates totales',
      pick: '1',
      promotion: 'Suplente de Oro',
    };
    const q = evaluate(c.expected, p);
    expect(q.fields.market.wrong).toBe(1);
    expect(q.fields.pick.wrong).toBe(1);
  });
  it('detects team goals becoming match goals', () => {
    const c = corpus.cases.find((c) => c.id === 'mixed-builders')!;
    const p = asParsed(c.expected);
    p.selections[2].builderMarkets![1].market = 'Goles totales Más/Menos';
    expect(evaluate(c.expected, p).fields.market.wrong).toBe(1);
  });
  it('does not hide diacritic errors or normalize operators away', () => {
    const c = corpus.cases[0];
    const p = asParsed(c.expected);
    p.selections[0].market = p.selections[0].market.replace('Próximo', 'Proximo');
    expect(evaluate(c.expected, p).fields.market.wrong).toBe(1);
  });
});

describe('Phase 1 contracts promoted to required Phase 2 regressions', () => {
  for (const probe of probes) {
    it(`${probe.id}: preserves all expected fields without omissions or extra picks`, () => {
      const q = evaluate(probe.expected, actualProbe(probe));
      expect(failureSignatures(q)).toEqual([]);
      expect(q.complete).toBe(true);
    });
    if (probe.knownFailure) {
      it(`${probe.id}: repaired contract preserves roles while requiring review`, () => {
        expect(evaluate(probe.expected, actualProbe(probe)).complete).toBe(true);
        expect(actualProbe(probe).reviewReasons?.length).toBeGreaterThan(0);
      });
    }
    it(`${probe.id}: registration uses an isolated fake database and never executes a cashout`, async () => {
      const db = new BettrackDB(`phase1-unit-${crypto.randomUUID()}`);
      try {
        const repository = new LocalRepository(db);
        await repository.init();
        await db.images.add({
          id: 'image',
          hash: 'fixture',
          name: 'fixture',
          blob: new Blob(['synthetic']),
        });
        await db.uploads.add({
          id: 'upload',
          imageId: 'image',
          createdAt: '2026-01-01T12:00:00.000Z',
          status: 'queued',
          progress: 0,
          draftJson: '',
          reason: '',
        });
        await registerCapture('upload', actualProbe(probe), repository);
        expect((await db.uploads.get('upload'))?.status).toBe(
          probe.knownFailure ? 'review' : 'saved',
        );
        expect(await db.bets.count()).toBe(probe.knownFailure ? 0 : 1);
        expect(await db.movements.count()).toBe(probe.knownFailure ? 0 : 1);
        expect(await db.settlements.count()).toBe(0);
      } finally {
        await db.delete();
      }
    });
  }
});

describe('Phase 1 exclusive timing', () => {
  it('subtracts nested reconstruction/validation from interpretation without double counting', () => {
    let now = 0;
    const t = createTiming(() => now);
    t.sync('interpretation', () => {
      now += 1;
      t.sync('reconstruction', () => {
        now += 5;
      });
      now += 2;
    });
    expect(t.summary().interpretation.ms).toBe(3);
    expect(t.summary().reconstruction.ms).toBe(5);
  });
  it('closes timers on sync/async exceptions and allows subsequent samples', async () => {
    let now = 0;
    const t = createTiming(() => now);
    expect(() =>
      t.sync('validation', () => {
        now += 3;
        throw new Error('expected');
      }),
    ).toThrow();
    await expect(
      t.async('registration', async () => {
        now += 4;
        throw new Error('expected');
      }),
    ).rejects.toThrow();
    expect(t.summary().validation.ms).toBe(3);
    expect(t.summary().registration.ms).toBe(4);
    t.reset();
    expect(t.samples).toHaveLength(0);
  });
});
