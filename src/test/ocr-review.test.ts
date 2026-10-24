import { it, expect, vi } from 'vitest';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture, confirmCaptureReview, enqueueCaptures } from '../data/captures';
import { readDraft, reviewIssues } from '../ocr/review';
import { parseTicket } from '../ocr/parser';
import { layoutProbe, line } from '../../tests/ocr-phase1/controlled';
vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error('External access forbidden');
      },
    },
  ),
}));
vi.mock('../ocr/optimize', () => ({ optimizeImage: async (blob: Blob) => ({ blob }) }));
vi.mock('../ocr/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ocr/engine')>()),
  hashImage: async () => 'proof-hash',
}));

export function ticket(footer = 'CASH OUT S/8.90') {
  return parseTicket('', [
    ...layoutProbe().lines.filter((l) => !l.text.includes('CASH OUT')),
    ...footer.split('\n').map((t, i) => line(t, 160, 900 + i * 40)),
  ]);
}
export async function fixture(run: (db: BettrackDB, repo: LocalRepository) => Promise<void>) {
  const db = new BettrackDB(`review-${crypto.randomUUID()}`);
  try {
    const repo = new LocalRepository(db);
    await repo.init();
    await db.images.add({ id: 'image', hash: 'test', name: 'test.png', blob: new Blob(['test']) });
    await db.uploads.add({
      id: 'upload',
      imageId: 'image',
      status: 'queued',
      createdAt: '2026-01-01T12:00:00.000Z',
      progress: 0,
      draftJson: '',
      reason: '',
    });
    await run(db, repo);
  } finally {
    await db.delete();
  }
}
it.each(['Crear apuesta', 'Pendiente'])(
  'a reread cannot erase placement uncertainty: %s',
  async (footer) => {
    await fixture(async (db, repo) => {
      await registerCapture('upload', ticket(footer), repo);
      expect((await db.uploads.get('upload'))?.status).toBe('review');
      await db.uploads.update('upload', { status: 'processing', enhanced: true });
      await registerCapture('upload', ticket(), repo);
      expect((await db.uploads.get('upload'))?.status).toBe('review');
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
    });
  },
);

async function reviewable(db: BettrackDB, repo: LocalRepository) {
  const parsed = ticket();
  parsed.selections[0].odds = null;
  parsed.selections[0].market = 'Mercado no catalogado';
  await registerCapture('upload', parsed, repo);
  const upload = (await db.uploads.get('upload'))!;
  const selections = structuredClone(parsed.selections);
  selections[0].odds = 1.33;
  return {
    expectedDraft: upload.draftJson,
    imageId: upload.imageId,
    selections,
    acknowledged: true,
  };
}

it('explicit review preserves original text, records exact corrections and debits stake once without settlement', async () =>
  fixture(async (db, repo) => {
    const confirmation = await reviewable(db, repo);
    await confirmCaptureReview('upload', confirmation, repo);
    const bet = (await db.bets.toArray())[0];
    const draft = readDraft((await db.uploads.get('upload'))!.draftJson)!;
    expect(draft.text).toBe(JSON.parse(confirmation.expectedDraft).text);
    expect(draft.humanReviewed).toBe(true);
    expect((await db.selections.toArray()).find((s) => s.order === 0)?.market).toBe(
      'Mercado no catalogado',
    );
    expect(await db.movements.count()).toBe(1);
    expect((await db.movements.toArray())[0].amount).toBe(-bet.stake);
    expect(await db.settlements.count()).toBe(0);
    const audit = (await db.audit.toArray()).find(
      (a) => a.action === 'Revisión humana de captura',
    )!;
    expect(audit.before).toBe(confirmation.expectedDraft);
    expect(JSON.parse(audit.after)).toMatchObject({
      acknowledged: true,
      imageId: 'image',
      initialStatus: 'Pendiente',
      decision: 'saved',
      stake: bet.stake,
    });
    await expect(confirmCaptureReview('upload', confirmation, repo)).rejects.toThrow('cambió');
    expect(await db.movements.count()).toBe(1);
  }));

it.each(['acknowledgment', 'draft', 'image', 'status', 'odds', 'omit', 'header'])(
  'rejects unsafe review atomically: %s',
  async (fault) =>
    fixture(async (db, repo) => {
      const c = await reviewable(db, repo);
      if (fault === 'acknowledgment') c.acknowledged = false;
      if (fault === 'draft') c.expectedDraft += ' ';
      if (fault === 'image') c.imageId = 'other';
      if (fault === 'status') await db.uploads.update('upload', { status: 'processing' });
      if (fault === 'odds') c.selections[0].odds = null;
      if (fault === 'omit') c.selections.pop();
      if (fault === 'header') {
        const bad = JSON.parse(c.expectedDraft);
        bad.stake = -100;
        c.expectedDraft = JSON.stringify(bad);
        await db.uploads.update('upload', { draftJson: c.expectedDraft });
      }
      const audits = await db.audit.count();
      await expect(confirmCaptureReview('upload', c, repo)).rejects.toThrow();
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
      expect(await db.audit.count()).toBe(audits);
    }),
);

it.each(['Crear apuesta', 'Cerrar apuesta', 'Pendiente'])(
  'manual review cannot confirm placement without evidence: %s',
  async (footer) =>
    fixture(async (db, repo) => {
      const p = ticket(footer);
      await registerCapture('upload', p, repo);
      const upload = (await db.uploads.get('upload'))!;
      await expect(
        confirmCaptureReview(
          'upload',
          {
            expectedDraft: upload.draftJson,
            imageId: 'image',
            selections: p.selections,
            acknowledged: true,
          },
          repo,
        ),
      ).rejects.toThrow('comprobante');
      expect(await db.movements.count()).toBe(0);
    }),
);

it.each(['Crear apuesta', 'Pendiente'])(
  'recovered cashout evidence requires explicit review, with preparation still blocked: %s',
  async (footer) =>
    fixture(async (db, repo) => {
      await registerCapture('upload', ticket(footer), repo);
      await registerCapture('upload', ticket(), repo);
      const upload = (await db.uploads.get('upload'))!;
      const operation = confirmCaptureReview(
        'upload',
        {
          expectedDraft: upload.draftJson,
          imageId: 'image',
          selections: ticket().selections,
          acknowledged: true,
        },
        repo,
      );
      if (footer === 'Crear apuesta') {
        await expect(operation).rejects.toThrow('comprobante');
        expect(await db.movements.count()).toBe(0);
      } else {
        await operation;
        expect(await db.movements.count()).toBe(1);
      }
    }),
);

it('manual review cannot omit a builder child', async () =>
  fixture(async (db, repo) => {
    const c = await reviewable(db, repo);
    const p = JSON.parse(c.expectedDraft);
    p.selections[0].builderMarkets = [{ market: 'Mercado visible', pick: 'Sí' }];
    c.expectedDraft = JSON.stringify(p);
    await db.uploads.update('upload', { draftJson: c.expectedDraft });
    await expect(confirmCaptureReview('upload', c, repo)).rejects.toThrow('omitir');
    expect(await db.movements.count()).toBe(0);
  }));

it('manual review preserves duplicate protection and all historical rows', async () =>
  fixture(async (db, repo) => {
    const c = await reviewable(db, repo);
    await confirmCaptureReview('upload', c, repo);
    const before = await db.bets.toArray(),
      movements = await db.movements.toArray();
    await db.uploads.add({
      ...(await db.uploads.get('upload'))!,
      id: 'second',
      status: 'review',
      draftJson: c.expectedDraft,
      betId: undefined,
    });
    await confirmCaptureReview('second', c, repo);
    expect((await db.uploads.get('second'))!.status).toBe('duplicate');
    expect(await db.bets.toArray()).toEqual(before);
    expect(await db.movements.toArray()).toEqual(movements);
  }));

it('complete OCR waits for explicit review before any financial write', async () =>
  fixture(async (db, repo) => {
    const houses = await db.houses.toArray();
    await registerCapture('upload', ticket(), repo);
    expect((await db.uploads.get('upload'))?.status).toBe('review');
    expect(await db.bets.count()).toBe(0);
    expect(await db.movements.count()).toBe(0);
    expect(await db.houses.toArray()).toEqual(houses);
  }));

it('legacy duplicate permission cannot debit the same ticket twice', async () =>
  fixture(async (db, repo) => {
    const c = await reviewable(db, repo);
    await confirmCaptureReview('upload', c, repo);
    await db.uploads.add({
      ...(await db.uploads.get('upload'))!, id: 'second', status: 'review',
      draftJson: c.expectedDraft, betId: undefined, allowDuplicate: true,
    });
    await confirmCaptureReview('second', c, repo);
    expect((await db.uploads.get('second'))?.status).toBe('duplicate');
    expect(await db.bets.count()).toBe(1);
    expect(await db.movements.count()).toBe(1);
  }));

it('new proof is independent and audited; a preparation image is retained without finances', async () =>
  fixture(async (db, repo) => {
    await registerCapture('upload', ticket('Crear apuesta'), repo);
    const before = await db.uploads.get('upload');
    const result = await enqueueCaptures(
      [new File(['new'], 'proof.png', { type: 'image/png' })],
      repo,
      undefined,
      'upload',
    );
    expect(result.added).toBe(1);
    expect(await db.uploads.get('upload')).toEqual(before);
    const proof = (await db.uploads.toArray()).find((u) => u.id !== 'upload')!;
    expect(proof.draftJson).toBe('');
    expect(proof.status).toBe('queued');
    expect(await db.movements.count()).toBe(0);
    expect(
      (await db.audit.toArray()).some(
        (a) =>
          a.action === 'Añadir comprobante independiente' &&
          JSON.parse(a.after).proofFor === 'upload',
      ),
    ).toBe(true);
    await registerCapture(proof.id, ticket('Crear apuesta'), repo);
    expect(await db.movements.count()).toBe(0);
  }));

it.each(['same-image', 'removed-parent'])('rejects invalid proof: %s', async (fault) =>
  fixture(async (db, repo) => {
    await registerCapture('upload', ticket('Crear apuesta'), repo);
    if (fault === 'same-image') await db.images.update('image', { hash: 'proof-hash' });
    else await db.uploads.delete('upload');
    const count = await db.images.count();
    const result = await enqueueCaptures(
      [new File(['proof'], 'proof.png', { type: 'image/png' })],
      repo,
      undefined,
      'upload',
    );
    expect(result.added).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(await db.images.count()).toBe(count);
    expect(await db.movements.count()).toBe(0);
  }),
);

it('renaming and uploading identical pixels retains placement uncertainty', async () =>
  fixture(async (db, repo) => {
    await registerCapture('upload', ticket('Crear apuesta'), repo);
    await db.images.update('image', { hash: 'proof-hash' });
    await enqueueCaptures([new File(['proof'], 'renamed.png', { type: 'image/png' })], repo);
    const second = (await db.uploads.toArray()).find((u) => u.id !== 'upload')!;
    await registerCapture(second.id, ticket(), repo);
    expect((await db.uploads.get(second.id))?.status).toBe('review');
    expect(await db.movements.count()).toBe(0);
  }));

it('two queued copies cannot bypass uncertainty if one finishes OCR later', async () =>
  fixture(async (db, repo) => {
    await db.uploads.add({ ...(await db.uploads.get('upload'))!, id: 'second' });
    await registerCapture('upload', ticket('Crear apuesta'), repo);
    await registerCapture('second', ticket(), repo);
    expect((await db.uploads.get('second'))?.status).toBe('review');
    expect(await db.movements.count()).toBe(0);
  }));

it('incomplete event and builder fields remain editable without discarding placement history', async () =>
  fixture(async (db, repo) => {
    const p = ticket('Crear apuesta');
    p.selections[0].event = '';
    p.selections[0].builderMarkets = [{ market: '', pick: 'Más de 1.5' }];
    await registerCapture('upload', p, repo);
    expect(readDraft((await db.uploads.get('upload'))!.draftJson)?.selections[0].event).toBe('');
    await registerCapture('upload', ticket(), repo);
    expect((await db.uploads.get('upload'))?.status).toBe('review');
    expect(await db.movements.count()).toBe(0);
  }));

it('even an invalid legacy draft cannot erase its raw preparation evidence', async () =>
  fixture(async (db, repo) => {
    await db.uploads.update('upload', {
      status: 'review',
      draftJson: JSON.stringify({ text: 'Crear apuesta', selections: 'invalid legacy data' }),
    });
    await registerCapture('upload', ticket(), repo);
    expect((await db.uploads.get('upload'))?.status).toBe('review');
    expect(await db.movements.count()).toBe(0);
  }));

it('explains missing odds, semantic uncertainty, placement and duplicates separately', async () =>
  fixture(async (db, repo) => {
    await reviewable(db, repo);
    const upload = (await db.uploads.get('upload'))!;
    expect(reviewIssues(upload).map((i) => i.kind)).toEqual(
      expect.arrayContaining(['odds', 'semantic']),
    );
    expect(reviewIssues({ ...upload, status: 'duplicate' })[0].kind).toBe('duplicate');
    expect(
      reviewIssues({ ...upload, draftJson: JSON.stringify(ticket('Crear apuesta')) }).map(
        (i) => i.kind,
      ),
    ).toContain('placement');
  }));
