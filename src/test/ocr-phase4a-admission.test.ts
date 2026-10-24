// Admission regression; never runs OCR, cloud or production registration.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import corpus from '../../tests/ocr-phase4a/cases.json';
import admission from '../../tests/ocr-phase4a/admission.json';
import { manifestSchema } from '../../tests/ocr-phase4a/contract';
import { decodedPixels } from '../../tests/ocr-phase4a/png';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tests/ocr-phase4a');
const cases = manifestSchema.parse(corpus).cases;
const get = (id: string) => cases.find((c) => c.id === id)!;
const count = (values: string[]) =>
  values.reduce(
    (out, key) => {
      out[key] = (out[key] ?? 0) + 1;
      return out;
    },
    {} as Record<string, number>,
  );

describe('Issue 1: reviewed public copies and conservative accounting', () => {
  it.each(cases)('$id: decodes losslessly with valid CRC and opaque pixels', (c) => {
    const { width, height, rgba } = decodedPixels(readFileSync(path.join(root, c.image)));
    expect([width, height]).toEqual([c.width, c.height]);
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] !== 255) throw new Error('Unexpected hidden alpha pixels');
    expect(c.review.authorizationRef).toBe(`issue-1-reviewed-copy-${c.id}`);
    expect(c.review.reviewedOn).toBe(admission.reviewedOn);
  });
  it('reconciles received, accepted, pending, pixels, scopes and periods without double-counting Builders', () => {
    const counts = admission.counts;
    expect(admission.records).toHaveLength(counts.received);
    expect(new Set(admission.records.map((r) => r.id)).size).toBe(counts.received);
    expect(
      admission.records
        .filter((r) => r.status === 'admitted')
        .map((r) => r.id)
        .sort(),
    ).toEqual(cases.map((c) => c.id).sort());
    expect(cases).toHaveLength(counts.admitted);
    expect(admission.records.filter((r) => r.status === 'pending')).toHaveLength(counts.pending);
    expect(admission.records.filter((r) => r.status === 'rejected')).toHaveLength(counts.rejected);
    expect(counts.admitted + counts.pending + counts.rejected + counts.exactDuplicatesRemoved).toBe(
      counts.received,
    );
    const pixels = cases.map((c) => {
      const p = decodedPixels(readFileSync(path.join(root, c.image)));
      return `${p.width}x${p.height}:` + createHash('sha256').update(p.rgba).digest('hex');
    });
    expect(new Set(pixels).size).toBe(cases.length);
    expect(count(cases.map((c) => c.category))).toEqual(counts.category);
    expect(count(cases.map((c) => c.expected.placement))).toEqual(counts.placement);
    expect(count(cases.map((c) => c.expected.settlement))).toEqual(counts.settlement);
    expect(count(cases.map((c) => c.expected.cashoutKind))).toEqual(counts.cashout);
    const selections = cases.flatMap((c) => c.expected.selections);
    const meanings = selections.flatMap((s) =>
      s.builderMarkets.length ? s.builderMarkets.map((b) => b.meaning) : [s.meaning!],
    );
    expect(selections).toHaveLength(counts.events);
    expect(selections.filter((s) => s.builderMarkets.length)).toHaveLength(
      counts.builderContainers,
    );
    expect(meanings).toHaveLength(counts.semanticLeaves);
    expect(count(meanings.map((m) => m.scope))).toEqual(counts.scope);
    expect(count(meanings.map((m) => m.period))).toEqual(counts.period);
    expect(
      new Set(admission.records.filter((r) => r.status === 'admitted').map((r) => r.ticketGroup))
        .size,
    ).toBe(counts.admittedTicketGroupsConservative);
    expect(new Set(admission.records.map((r) => r.ticketGroup)).size).toBe(
      counts.candidateTicketGroupsConservative,
    );
    expect(counts.verifiedUniqueTickets).toBeNull();
    expect(cases.some((c) => c.id === 'preparation-flamengo')).toBe(false);
  });
  it('keeps temporal states independent and the crossed-out player in raw evidence', () => {
    for (const group of admission.temporalGroups) {
      expect(group.relation).toBe('probable-same-ticket');
      const members = group.members.map(get);
      expect(new Set(members.map((c) => c.sha256)).size).toBe(2);
      expect(new Set(members.map((c) => c.transcript)).size).toBe(2);
      expect(new Set(members.map((c) => c.expected.stake)).size).toBe(1);
      expect(members.every((c) => c.expected.settlement === 'unknown')).toBe(true);
    }
    expect(get('player-four-early').expected.placement).toBe('confirmed');
    expect(get('player-four-updated').expected.placement).toBe('unknown');
    expect(get('player-four-updated').expected.selections[3].pick).toBe('Nelson Deossa');
    expect(get('player-four-updated').transcript).toContain('[texto tachado: Troy Parrott]');
    for (const c of cases) expect(c.expected.settledReturn).toBeNull();
  });
  it('retains literal corrections, missing global odds, and team/match/player distinctions', () => {
    expect(get('first-half-juventus').expected.selections[0].pick).toBe('Más de 2.5');
    expect(get('mixed-five-selections').expected.selections[2].odds).toBe(1.57);
    expect(get('lost-single-jablonec').expected).toMatchObject({
      odds: null,
      potential: null,
      settlement: 'Perdida',
    });
    expect(get('lost-single-jablonec').expected.selections[0]).toMatchObject({
      pick: 'Más 0.5',
      odds: 6.9,
    });
    expect(get('failed-leg-juventus').expected).toMatchObject({
      potential: 0,
      settlement: 'unknown',
      settledReturn: null,
    });
    expect(get('team-shots-bournemouth').expected.selections[0].meaning).toMatchObject({
      statistic: 'shots',
      scope: 'team',
      participant: 'AFC Bournemouth',
    });
    expect(
      get('brugge-builder-early').expected.selections[0].builderMarkets[2].meaning,
    ).toMatchObject({ statistic: 'shots', scope: 'match', participant: null });
    expect(get('player-kane-mbappe').expected.selections[1].meaning).toMatchObject({
      statistic: 'shots-on-target',
      scope: 'player',
      participant: 'Kylian Mbappe',
    });
  });
  it('detects a deliberately corrupted byte; this control is never saved as a capture', () => {
    const bytes = Buffer.from(readFileSync(path.join(root, cases[0].image)));
    bytes[29] ^= 1; // IHDR CRC, not a fabricated real screenshot
    expect(() => decodedPixels(bytes)).toThrow('PNG CRC mismatch');
  });
});
