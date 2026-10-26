import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTiming, prepareAutomaticImport } from '../ocr/automaticImport';
import { readDraft } from '../ocr/review';
import type { CaptureUpload } from '../domain/model';
import { betPlacementMode } from '../ocr/visualMode';

const visualMode = {
  mode: 'live',
  basis: 'betano-orange-lightning-v1',
  imageHash: 'a'.repeat(64),
  bbox: { x0: 0.89, y0: 0.54, x1: 0.92, y1: 0.59 },
};
const recordedAt = '2026-10-25T19:00:00.000Z';
function fixture(label: string, extra = '') {
  const upload: CaptureUpload = {
    id: 'delayed-qa',
    imageId: 'synthetic-qa',
    status: 'review',
    progress: 100,
    createdAt: '2026-10-25T18:00:00.000Z',
    reason: '',
    draftJson: JSON.stringify({
      house: 'Betano',
      kind: 'Simple',
      stake: 10000,
      visualMode,
      text: `Betano\nSimple S/100.00 Ganada\nClub QA\n${label}\nClub QB\nApuesta S/100.00\nGanancias S/140.00\n${extra}`,
      selections: [
        {
          event: 'Club QA vs. Club QB',
          market: 'Goles totales Más/Menos',
          pick: 'Más de 2.5',
          odds: 2,
          sport: '',
          league: '',
        },
      ],
      warnings: [],
      confidence: {},
    }),
  };
  return { upload, draft: readDraft(upload.draftJson)! };
}
describe('screenshots uploaded after the bet was accepted', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-10-26T00:00:00.000Z')));
  afterEach(() => vi.useRealTimers());
  it.each(['Hoy 18:00', 'Mañana 18:00', 'Esta noche 18:00'])(
    'preserves %s without anchoring it to the upload date',
    (label) => {
      const { draft, upload } = fixture(label);
      const timing = captureTiming(draft, upload, recordedAt);
      expect(timing.events).toEqual([
        { selection: 0, label, at: null, relative: true, basis: 'upload-reference' },
      ]);
      expect(timing).toMatchObject({
        uploadedAt: upload.createdAt,
        recordedAt,
        betAt: null,
        settledAt: null,
      });
      const later = captureTiming(
        draft,
        { ...upload, createdAt: '2026-11-02T18:00:00.000Z' },
        '2026-11-02T19:00:00.000Z',
      );
      expect(later.events).toEqual(timing.events);
    },
  );
  it('does not turn a match lightning into evidence of when the wager was placed', () => {
    const { draft, upload } = fixture('86:33');
    expect(captureTiming(draft, upload, recordedAt).mode).toBe('unknown');
    expect(prepareAutomaticImport(upload, recordedAt).historical).toMatchObject({
      kind: 'Ganada',
      returned: 14000,
      timing: { mode: 'unknown' },
    });
  });
  it('preserves explicit prematch placement even when the match is live in the later screenshot', () => {
    const { draft, upload } = fixture('86:33', 'Apuesta prematch');
    expect(captureTiming(draft, upload, recordedAt).mode).toBe('prematch');
  });
  it('preserves explicit calendar evidence and does not turn match time into bet time', () => {
    const { draft, upload } = fixture('20/10/2026 18:00');
    expect(captureTiming(draft, upload, recordedAt)).toMatchObject({
      betAt: null,
      settledAt: null,
      events: [
        { selection: 0, at: '2026-10-20T23:00:00.000Z', relative: false, basis: 'ticket-calendar' },
      ],
    });
  });
  it.each([
    'No es una apuesta en vivo',
    'Puedes hacer una apuesta en vivo',
    'Apuesta en vivo si confirmas',
    'En vivo',
    '90:00',
    'Hoy 18:00',
  ])('does not derive placement mode from a caption: %s', (text) => {
    expect(betPlacementMode({ text })).toBe('unknown');
  });
  it.each(['Apuesta en vivo', 'Tipo de apuesta: En vivo', 'Modalidad: En vivo'])(
    'retains an explicit live placement label: %s',
    (text) => {
      expect(betPlacementMode({ text })).toBe('live');
    },
  );
  it('does not choose between contradictory explicit placement modes', () => {
    expect(betPlacementMode({ text: 'Apuesta prematch\nApuesta en vivo' })).toBe('unknown');
  });
});
