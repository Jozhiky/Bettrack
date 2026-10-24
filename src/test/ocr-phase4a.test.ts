// No cloud imports. Real evidence, oracle mutations and inherited synthetic
// controls are deliberately separate; this suite does not measure pixel OCR.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import phase1 from '../../tests/ocr-phase1/cases.json';
import phase3 from '../../tests/ocr-phase3/cases.json';
import annotations from '../../tests/ocr-phase3/semantics.json';
import baseline from '../../tests/ocr-phase4a/legacy.lock.json';
import manifest from '../../tests/ocr-phase4a/cases.json';
import {
  captureSchema,
  manifestSchema,
  meaningDifferences,
} from '../../tests/ocr-phase4a/contract';
import { interpretMarket } from '../ocr/semantics';
import { parseTicket } from '../ocr/parser';
import { layoutProbe } from '../../tests/ocr-phase1/controlled';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpus = [...phase1.cases, ...phase3.cases];
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const categories = ['football', 'nba', 'bet-builder', 'cashout', 'settled'];
const leaves = corpus.flatMap((c) =>
  c.expected.selections.flatMap((s) => ('builderMarkets' in s ? s.builderMarkets! : [s])),
);

describe('4A: immutable real baseline and auditable inventory', () => {
  it.each(baseline.files)('$path retains its reviewed content', (f) => {
    const bytes = readFileSync(path.join(root, f.path));
    expect(sha(f.mode === 'text-lf' ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes)).toBe(
      f.sha256,
    );
  });
  it('accounts for all seven images and all 57 semantic leaves', () => {
    expect(corpus).toHaveLength(7);
    expect(corpus.reduce((n, c) => n + c.expected.selections.length, 0)).toBe(33);
    expect(leaves).toHaveLength(57);
    const meanings = Object.values(annotations.cases).flatMap((c) => c.attributes);
    expect(meanings).toHaveLength(57);
    const count = (key: 'scope' | 'period' | 'statistic') =>
      meanings.reduce(
        (acc, m) => {
          acc[m[key]] = (acc[m[key]] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    expect(count('scope')).toEqual({ match: 46, player: 8, team: 3 });
    expect(count('period')).toEqual({ unspecified: 53, 'first-half': 4 });
    expect(count('statistic')).toEqual({
      result: 22,
      goals: 14,
      'shots-on-target': 9,
      corners: 5,
      handicap: 2,
      'both-teams-to-score': 2,
      cards: 1,
      scorer: 1,
      'next-goal': 1,
    });
    expect(corpus.filter((c) => 'cashoutOffer' in c.expected)).toHaveLength(6);
    expect(Object.values(annotations.cases).every((c) => c.settlement === 'unknown')).toBe(true);
    for (const c of corpus) {
      const expectedPaths = c.expected.selections.flatMap((s, i) =>
        'builderMarkets' in s
          ? s.builderMarkets!.map((_, j) => `selections[${i}].builderMarkets[${j}]`)
          : [`selections[${i}]`],
      );
      expect(
        annotations.cases[c.id as keyof typeof annotations.cases].attributes.map((a) => a.path),
      ).toEqual(expectedPaths);
    }
  });
});

describe('4A: independent semantics on existing real text (not a new OCR run)', () => {
  const real = [
    {
      id: 'team',
      selection: phase1.cases[4].expected.selections[2],
      child: 1,
      meaning: annotations.cases['mixed-builders'].attributes[4],
    },
    {
      id: 'match',
      selection: phase1.cases[4].expected.selections[1],
      child: 0,
      meaning: annotations.cases['mixed-builders'].attributes[1],
    },
    {
      id: 'first-half',
      selection: phase1.cases[3].expected.selections[0],
      child: null,
      meaning: annotations.cases['first-half-corners'].attributes[0],
    },
  ];
  it.each(real)('$id keeps scope, participant and period', ({ selection, child, meaning }) => {
    const s =
      child === null
        ? selection
        : 'builderMarkets' in selection
          ? selection.builderMarkets![child]
          : undefined;
    if (!s) throw new Error('Missing reviewed Builder child');
    const { path: _path, ...expected } = meaning;
    expect(
      meaningDifferences(
        expected as Parameters<typeof meaningDifferences>[0],
        interpretMarket(s.market, s.pick, selection.event),
      ),
    ).toEqual([]);
  });
  it('keeps human player evidence while exposing the unresolved engine identity', () => {
    const selection = phase1.cases[1].expected.selections[0];
    if (!('builderMarkets' in selection)) throw new Error('Missing reviewed Builder');
    const s = selection.builderMarkets![0];
    const { path: _path, ...human } = annotations.cases['player-builders'].attributes[0];
    expect(human.scope).toBe('player');
    const actual = interpretMarket(s.market, s.pick, selection.event);
    expect(actual).toMatchObject({
      scope: 'unknown',
      participant: 'Nico Paz',
      confidence: { scope: 'review', participant: 'review' },
    });
    expect(meaningDifferences(human as Parameters<typeof meaningDifferences>[0], actual)).toEqual([
      'scope',
    ]);
  });
  it.each([
    ['scope', 'team'],
    ['scope', 'player'],
    ['period', 'first-period'],
    ['period', 'full-match'],
  ])('oracle rejects deliberate %s corruption to %s', (field, replacement) => {
    const { path: _path, ...human } = annotations.cases['first-half-corners'].attributes[0];
    expect(
      meaningDifferences(human as Parameters<typeof meaningDifferences>[0], {
        ...human,
        [field]: replacement,
      }),
    ).toEqual([field]);
  });
  it('oracle rejects player-to-team/match and identity substitutions', () => {
    const { path: _path, ...human } = annotations.cases['player-builders'].attributes[0];
    for (const scope of ['team', 'match'])
      expect(
        meaningDifferences(human as Parameters<typeof meaningDifferences>[0], { ...human, scope }),
      ).toEqual(['scope']);
    expect(
      meaningDifferences(human as Parameters<typeof meaningDifferences>[0], {
        ...human,
        participant: null,
      }),
    ).toEqual(['participant']);
  });
});

describe('4A: inherited synthetic controls; zero real NBA/first-period coverage', () => {
  // Labels and expected meanings already present in ocr-phase2/ocr-phase21.
  it.each([
    ['Puntos en Primer Período', 'match'],
    ['Equipo Norte - Puntos en Primer Período', 'team'],
  ])('%s survives ordinary and Builder selections without becoming first half', (market, scope) => {
    for (const builder of [false, true]) {
      const parsed = parseTicket('', layoutProbe({ market, builder }).lines);
      const actual = parsed.interpretations![0].value;
      expect(actual).toMatchObject({ scope, period: 'first-period', statistic: 'points' });
      expect(actual.original.market).toBe(market);
      expect(actual.sport).toBeNull(); // points do not establish NBA
      expect(actual.period).not.toBe('first-half');
      const changed = { ...actual, period: 'first-half' };
      const { statistic, participant, period } = actual;
      expect(
        meaningDifferences({ statistic, participant, period, scope: actual.scope }, changed),
      ).toEqual(['period']);
    }
  });
});

describe('4A: future real-capture admission', () => {
  // Structural validation control based on the existing timed-goal PNG. It is
  // never written to the new manifest, counted as new evidence or run as OCR.
  function admissionControl() {
    const c = phase1.cases[0];
    const { path: _path, ...meaning } = annotations.cases['timed-goal'].attributes[0];
    const expected = {
      ...c.expected,
      placement: 'confirmed',
      settlement: 'unknown',
      cashoutKind: 'offer',
      settledReturn: null,
      selections: c.expected.selections.map((s) => ({
        ...s,
        sport: null,
        league: null,
        meaning,
        builderMarkets: [],
      })),
    };
    const evidence: {
      field: string;
      box: [number, number, number, number] | null;
      observation: string;
    }[] = [];
    function visit(value: unknown, at: string) {
      if (Array.isArray(value) && value.length) value.forEach((v, i) => visit(v, `${at}[${i}]`));
      else if (value !== null && !Array.isArray(value) && typeof value === 'object')
        Object.entries(value).forEach(([key, v]) => visit(v, at ? `${at}.${key}` : key));
      else
        evidence.push({
          field: at,
          box: value === null || Array.isArray(value) ? null : [0, 0, 360, 338],
          observation:
            'Control estructural sobre timed-goal ya revisado; no constituye una nueva admisión.',
        });
    }
    visit(expected, '');
    return {
      id: c.id,
      category: 'football',
      tags: c.tags,
      image: `images/football/${c.id}.png`,
      sha256: c.sha256,
      provenance: c.provenance,
      width: 360,
      height: 338,
      review: {
        publicationAuthorized: true,
        privacyChecked: true,
        visualChecked: true,
        independentAnnotation: true,
        reviewedOn: '2026-10-23',
        authorizationRef: 'legacy-corpus',
      },
      redactions: [],
      transcript:
        'Betano\nSimple S/10.00\n1.60\nGol antes del minuto 70:00\n1.60\nPróximo gol antes de 70:00 (Gol 5)\nLille OSC\nGalatasaray SK\n45:00\n2\n2\nApuesta S/10.00\nGanancias potenciales S/16.00\nCASH OUT S/8.90',
      expected,
      evidence,
    };
  }
  it('accepts a fully specified structural control with explicit absences', () => {
    expect(captureSchema.safeParse(admissionControl()).success).toBe(true);
  });
  it.each([
    'publicationAuthorized',
    'privacyChecked',
    'visualChecked',
    'independentAnnotation',
  ] as const)('rejects missing review gate %s', (field) => {
    const c = admissionControl();
    c.review[field] = false;
    expect(captureSchema.safeParse(c).success).toBe(false);
  });
  it('rejects fractional cents, inferred realized returns and cashout relabelling', () => {
    const fractional = admissionControl();
    fractional.expected.stake = 10.5;
    expect(captureSchema.safeParse(fractional).success).toBe(false);
    const realized = {
      ...admissionControl(),
      expected: { ...admissionControl().expected, settledReturn: 1600 },
    };
    expect(captureSchema.safeParse(realized).success).toBe(false);
    const executed = admissionControl();
    executed.expected.cashoutKind = 'executed';
    expect(captureSchema.safeParse(executed).success).toBe(false);
  });
  it('rejects omitted/unknown evidence, out-of-bounds regions and unsafe paths', () => {
    const missing = admissionControl();
    missing.evidence.pop();
    expect(captureSchema.safeParse(missing).success).toBe(false);
    const field = admissionControl();
    field.evidence[0].field = 'unobserved';
    expect(captureSchema.safeParse(field).success).toBe(false);
    const box = admissionControl();
    box.evidence[0].box = [359, 0, 2, 20];
    expect(captureSchema.safeParse(box).success).toBe(false);
    const traversal = admissionControl();
    traversal.image = '../private.png';
    expect(captureSchema.safeParse(traversal).success).toBe(false);
  });
  it('rejects repeated cases and preserves missing odds as null', () => {
    const c = admissionControl();
    expect(manifestSchema.safeParse({ ...manifest, cases: [c, c] }).success).toBe(false);
    // Deliberate absence control, not a new real missing-odds capture.
    const absent = { ...c, expected: { ...c.expected, odds: null, stake: null, potential: null } };
    expect(captureSchema.parse(absent).expected).toMatchObject({
      odds: null,
      stake: null,
      potential: null,
    });
    const offerWithoutAmount = { ...c, expected: { ...c.expected, cashoutOffer: null } };
    expect(captureSchema.parse(offerWithoutAmount).expected.cashoutOffer).toBeNull();
    const raw = { ...c, transcript: `\n${c.transcript}\n` };
    expect(captureSchema.parse(raw).transcript).toBe(raw.transcript);
  });
  it('validates the manifest, image hashes/dimensions, metadata and duplicate baseline images', () => {
    const checked = manifestSchema.parse(manifest);
    const hashes = new Set(corpus.map((c) => c.sha256));
    for (const c of checked.cases) {
      expect(hashes.has(c.sha256)).toBe(false);
      hashes.add(c.sha256);
      const bytes = readFileSync(path.join(root, 'tests/ocr-phase4a', c.image));
      expect(sha(bytes)).toBe(c.sha256);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
      expect(bytes.readUInt32BE(16)).toBe(c.width);
      expect(bytes.readUInt32BE(20)).toBe(c.height);
      let offset = 8;
      const chunks: string[] = [];
      while (offset < bytes.length) {
        expect(offset + 12).toBeLessThanOrEqual(bytes.length);
        const size = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        expect(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']).toContain(type);
        chunks.push(type);
        offset += 12 + size;
        expect(offset).toBeLessThanOrEqual(bytes.length);
      }
      expect(chunks.at(-1)).toBe('IEND');
      expect(chunks).toContain('IDAT');
    }
    const actualFiles = categories.flatMap((category) =>
      readdirSync(path.join(root, 'tests/ocr-phase4a/images', category))
        .filter((f) => f !== '.gitkeep')
        .map((f) => `images/${category}/${f}`),
    );
    expect(actualFiles.sort()).toEqual(checked.cases.map((c) => c.image).sort());
  });
  it('rejects incomplete records instead of accepting invented defaults', () => {
    expect(captureSchema.safeParse({}).success).toBe(false);
    expect(captureSchema.safeParse({ id: 'pending', provenance: 'synthetic' }).success).toBe(false);
  });
});
