import { describe, expect, it, vi } from 'vitest';
import { line, layoutProbe } from '../../tests/ocr-phase1/controlled';
import { parseTicket, placementFromText, type ParsedTicket } from '../ocr/parser';
import { readCapture } from '../ocr/readCapture';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from './confirm-ready-capture';
import { position } from '../domain/model';

vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error('No external services in placement audit');
      },
    },
  ),
}));

// Controlled OCR geometry, not real Tesseract output. Remove the original offer
// so stake/odds/selections are identical and only placement evidence changes.
function evidence(footer: string) {
  return [
    ...layoutProbe().lines.filter((r) => !/CASH OUT/.test(r.text)),
    ...footer
      .split('\n')
      .filter(Boolean)
      .map((text, i) => line(text, 160, 900 + i * 40)),
  ];
}

async function withCapture(run: (db: BettrackDB, repository: LocalRepository) => Promise<void>) {
  const db = new BettrackDB(`placement-${crypto.randomUUID()}`);
  try {
    const repository = new LocalRepository(db);
    await repository.init();
    await db.images.add({
      id: 'image',
      hash: 'fixture',
      name: 'fixture.png',
      blob: new Blob(['fixture']),
    });
    await db.uploads.add({
      id: 'capture',
      imageId: 'image',
      createdAt: '2026-01-01T12:00:00.000Z',
      status: 'queued',
      draftJson: '',
      reason: '',
      progress: 0,
    });
    await run(db, repository);
  } finally {
    await db.delete();
  }
}

describe('Placement evidence, independent of settlement status', () => {
  it.each([
    ['Crear apuesta S/10.00', 'preparation'],
    ['Crear apuesta\nCerrar apuesta S/10.00', 'preparation'],
    ['Confirmar apuesta S/10.00', 'preparation'],
    ['Pendiente de confirmación', 'preparation'],
    ['Apuesta no confirmada', 'preparation'],
    ['Apuesta rechazada', 'preparation'],
    ['Cerrar apuesta S/10.00', 'unknown'],
    ['Pendiente', 'unknown'],
    ['Mis apuestas\nPendiente', 'unknown'],
    ['Sin CASHOUT S/8.90', 'unknown'],
    ['No CASHOUT S/8.90', 'unknown'],
    ['', 'unknown'],
    ['Apuesta confirmada si aceptas las cuotas', 'unknown'],
    ['Crear apuesta\nApuesta confirmada', 'unknown'],
    ['Crear apuesta\nCASH OUT S/8.90', 'unknown'],
  ])('never creates financial records from %s (%s)', async (footer, status) => {
    const parsed = parseTicket('', evidence(footer));
    expect(parsed.selections).toHaveLength(2);
    expect(parsed).toMatchObject({ stake: 1000, odds: 4, potential: 4000 });
    await withCapture(async (db, repository) => {
      const before = await repository.snapshot();
      const original = await db.images.get('image');
      await registerCapture('capture', parsed, repository);
      expect({
        status: (await db.uploads.get('capture'))?.status,
        bets: await db.bets.count(),
        movements: await db.movements.count(),
      }).toEqual({ status: 'review', bets: 0, movements: 0 });
      for (const key of [
        'bets',
        'selections',
        'movements',
        'settlements',
        'houses',
        'audit',
      ] as const)
        expect((await repository.snapshot())[key]).toEqual(before[key]);
      expect(await db.images.get('image')).toEqual(original);
      const draft = JSON.parse((await db.uploads.get('capture'))!.draftJson);
      expect(draft).toMatchObject({
        placement: { status },
        text: parsed.text,
        selections: parsed.selections,
      });
    });
  });

  it.each([
    'Apuesta realizada con éxito\nPendiente',
    'Apuesta confirmada\nPendiente\nCerrar apuesta S/8.90',
    'Apuesta aceptada\nPendiente',
    'CASH OUT S/8.90\nPendiente',
    'Cashout disponible\nCerrar apuesta S/8.90\nPendiente',
  ])('records an already placed but unsettled bet: %s', async (footer) => {
    const parsed = parseTicket('', evidence(footer));
    await withCapture(async (db, repository) => {
      await registerCapture('capture', parsed, repository);
      expect((await db.uploads.get('capture'))?.status).toBe('saved');
      const bet = (await db.bets.get('capture'))!;
      expect(position(bet, []).status).toBe('Pendiente');
      expect(await db.settlements.count()).toBe(0);
      expect(await db.movements.toArray()).toMatchObject([
        { kind: 'Apuesta colocada', amount: -1000 },
      ]);
      expect(parsed).toMatchObject({ placement: { status: 'confirmed' } });
    });
  });

  it('guards the complete readCapture -> parser -> registration flow', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValue({
        text: '',
        lines: evidence('Crear apuesta'),
        symbols: [],
        confidence: 95,
      });
    const parsed = await readCapture(
      { recognize, terminate: vi.fn() },
      new Blob(['fixture']),
      () => {},
    );
    expect(recognize).toHaveBeenCalledTimes(1);
    await withCapture(async (db, repository) => {
      await registerCapture('capture', parsed, repository);
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
      expect((await db.uploads.get('capture'))?.status).toBe('review');
    });
  });

  it('rechecks old/forged draft metadata and does not treat duplicate permission as placement proof', async () => {
    const parsed: ParsedTicket = parseTicket('', evidence('Cerrar apuesta S/10.00'));
    Object.assign(parsed, {
      placement: { status: 'confirmed', evidence: ['stale'] },
      cashoutOffer: 1000,
      reviewReasons: [],
    });
    await withCapture(async (db, repository) => {
      await db.uploads.update('capture', { allowDuplicate: true });
      await registerCapture('capture', parsed, repository);
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
      expect(JSON.parse((await db.uploads.get('capture'))!.draftJson)).toMatchObject({
        placement: { status: 'unknown' },
      });
    });
  });

  it.each(['saved', 'linked'] as const)(
    'preserves historical %s records without placement metadata',
    async (status) => {
      await withCapture(async (db, repository) => {
        const parsed = parseTicket('', evidence('Apuesta confirmada\nPendiente'));
        await registerCapture('capture', parsed, repository);
        // A legacy snapshot has no placement metadata, even after this policy exists.
        const legacy = { ...parsed } as ParsedTicket & { placement?: unknown };
        delete legacy.placement;
        await db.uploads.update('capture', { status, draftJson: JSON.stringify(legacy) });
        const before = await repository.snapshot();
        const oldUpload = await db.uploads.get('capture');
        await registerCapture('capture', parseTicket('', evidence('Crear apuesta')), repository);
        expect(await repository.snapshot()).toEqual(before);
        expect(await db.uploads.get('capture')).toEqual(oldUpload);
      });
    },
  );

  it('accepts legacy drafts with receipt evidence and no cached placement', async () => {
    const parsed = parseTicket('', evidence('Apuesta confirmada\nPendiente'));
    const legacy = { ...parsed } as ParsedTicket & { placement?: unknown };
    delete legacy.placement;
    await withCapture(async (db, repository) => {
      await registerCapture('capture', legacy, repository);
      expect((await db.uploads.get('capture'))?.status).toBe('saved');
      expect(await db.movements.count()).toBe(1);
    });
  });
  it('never automatically creates pending financial movements from a globally lost ticket', async () => {
    // Start from a well-formed fixture that would otherwise be saved. The
    // header is the sole controlled change; no production OCR is invoked.
    const parsed = parseTicket('', evidence('Apuesta confirmada\nPendiente'));
    expect(parsed).toMatchObject({ stake: 1000, odds: 4, potential: 4000 });
    expect(parsed.selections).toHaveLength(2);
    const previous = parsed.text;
    parsed.text = previous.replace(
      /^Combinada de 2 S\/10\.00.*$/m,
      'Combinada de 2 S/10.00 Perdida',
    );
    expect(parsed.text).not.toBe(previous);
    expect(placementFromText(parsed.text)).toMatchObject({ status: 'confirmed' });

    await withCapture(async (db, repository) => {
      const before = await repository.snapshot();
      await registerCapture('capture', parsed, repository);
      expect((await db.uploads.get('capture'))?.status).toBe('review');
      expect((await db.uploads.get('capture'))?.reason).toContain('Perdida');
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
      expect(await db.settlements.count()).toBe(0);
      for (const key of ['bets', 'selections', 'movements', 'settlements', 'houses', 'audit'] as const)
        expect((await repository.snapshot())[key]).toEqual(before[key]);
    });
  });

});
