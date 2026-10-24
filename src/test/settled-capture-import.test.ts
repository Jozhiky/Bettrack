import { describe, it, expect, vi } from 'vitest';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture, confirmCaptureReview, reopenHistoricalCapture } from '../data/captures';
import { parseTicket } from '../ocr/parser';
import { layoutProbe } from '../../tests/ocr-phase1/controlled';
import { position, totals } from '../domain/model';
import { settlementEvidence } from '../ocr/settlement';
import { readDraft, canReviewCapture } from '../ocr/review';
vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw Error('No production access');
      },
    },
  ),
}));
async function fixture(run: (db: BettrackDB, repo: LocalRepository) => Promise<void>) {
  const db = new BettrackDB('settled-' + crypto.randomUUID());
  try {
    const repo = new LocalRepository(db);
    await repo.init();
    await db.images.add({
      id: 'image',
      hash: 'synthetic',
      name: 'synthetic.png',
      blob: new Blob(['synthetic']),
    });
    await db.uploads.add({
      id: 'upload',
      imageId: 'image',
      createdAt: '2026-10-24T12:00:00Z',
      status: 'queued',
      progress: 0,
      draftJson: '',
      reason: '',
    });
    await run(db, repo);
  } finally {
    await db.delete();
  }
}
function ticket(status = 'Ganada') {
  const parsed = parseTicket('', layoutProbe().lines);
  parsed.text = parsed.text.replace(
    /^Combinada de 2 S\/10\.00.*$/m,
    `Combinada de 2 S/10.00 ${status}`,
  );
  return parsed;
}
describe('historical import contract', () => {
  it.each(['none', 'wrong-total', 'changed-leg', 'visible-total'])(
    'validates reviewed selection-product provenance: %s',
    async (fault) =>
      fixture(async (db, repo) => {
        const p = ticket('Perdida');
        p.text = 'Betano\nCombinada de 3 S/10.00 Perdida';
        p.expectedSelections = 3;
        delete p.odds;
        delete p.potential;
        p.selections = [2.02, 2.15, 1.36].map((odds, i) => ({
          ...p.selections[0],
          event: 'Equipo QA' + i + ' vs. Equipo QB' + i,
          odds,
        }));
        if (fault === 'visible-total') p.odds = 6;
        await registerCapture('upload', p, repo);
        const u = (await db.uploads.get('upload'))!;
        const c = {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: structuredClone(p.selections),
          acknowledged: true,
          historical: {
            kind: 'Perdida' as const,
            returned: 0,
            closedStake: 1000,
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            fullClosureConfirmed: true as const,
            header: {
              house: 'Betano' as const,
              kind: 'Combinada' as const,
              stake: 1000,
              odds: 5.9,
              potential: null,
              oddsSource: 'selection-product' as const,
              oddsCalculation: {
                method: 'product-truncate-2' as const,
                inputs: [2.02, 2.15, 1.36],
              },
            },
          },
        };
        if (fault === 'wrong-total') c.historical.header.odds = 5.91;
        if (fault === 'changed-leg') c.selections[0].odds = 2.03;
        if (fault !== 'none') {
          await expect(confirmCaptureReview('upload', c, repo)).rejects.toThrow('cuota calculada');
          expect(await db.bets.count()).toBe(0);
          expect(await db.movements.count()).toBe(0);
        } else {
          await confirmCaptureReview('upload', c, repo);
          const s = await repo.snapshot();
          expect(s.bets[0]).toMatchObject({
            odds: 5.9,
            potential: null,
            oddsSource: 'selection-product',
            oddsCalculation: { method: 'product-truncate-2', inputs: [2.02, 2.15, 1.36] },
          });
          expect(s.movements).toHaveLength(2);
          expect(totals(s).profit).toBe(-1000);
        }
      }),
  );
  it.each([
    ['Ganada', 1400, null, null],
    ['Ganada', 1400, 4, null],
    ['Ganada', 1400, null, 4000],
    ['Perdida', 0, null, null],
    ['Perdida', 0, 4, null],
    ['Perdida', 0, null, 4000],
    ['Cashout', 700, null, null],
    ['Cashout', 700, 4, null],
    ['Cashout', 700, null, 4000],
  ] as const)(
    'preserves unknown historical terms for %s (%i, %s, %s)',
    async (kind, returned, odds, potential) =>
      fixture(async (db, repo) => {
        const p = ticket(kind === 'Cashout' ? 'Cash Out' : kind);
        delete p.odds;
        delete p.potential;
        await registerCapture('upload', p, repo);
        const u = (await db.uploads.get('upload'))!;
        const confirmation = {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: p.selections,
          acknowledged: true,
          historical: {
            kind,
            returned,
            closedStake: 1000,
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            fullClosureConfirmed: true as const,
            executionConfirmed: true as const,
            header: {
              house: 'Betano' as const,
              kind: 'Combinada' as const,
              stake: 1000,
              odds,
              potential,
            },
          },
        };
        await confirmCaptureReview('upload', confirmation, repo);
        const s = await repo.snapshot();
        expect(s.bets[0]).toMatchObject({ odds, potential, historical: true });
        expect(totals(s).profit).toBe(returned - 1000);
        expect(totals(s).average).toBe(odds);
        const before = await repo.snapshot();
        await expect(repo.undoSettlement(s.settlements[0].id)).rejects.toThrow('Completa la cuota');
        expect(await repo.snapshot()).toEqual(before);
        const altered = {
          ...confirmation,
          historical: { ...confirmation.historical, returned: returned + 1 },
        };
        await expect(confirmCaptureReview('upload', altered, repo)).rejects.toThrow(
          'borrador cambió',
        );
        expect(await repo.snapshot()).toEqual(before);
      }),
  );
  it('requires separate execution attestation for a terminal Cash Out header', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Cash Out');
      await registerCapture('upload', p, repo);
      const u = (await db.uploads.get('upload'))!;
      await expect(
        confirmCaptureReview(
          'upload',
          {
            expectedDraft: u.draftJson,
            imageId: 'image',
            selections: p.selections,
            acknowledged: true,
            historical: {
              kind: 'Cashout',
              returned: 700,
              closedStake: 1000,
              betDate: '2026-10-20T15:00:00.000Z',
              settlementDate: '2026-10-21T18:00:00.000Z',
              fullClosureConfirmed: true,
              header: {
                house: 'Betano',
                kind: 'Combinada',
                stake: 1000,
                odds: null,
                potential: null,
              },
            },
          },
          repo,
        ),
      ).rejects.toThrow('Confirma que el Cash Out');
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
    }));
  it('does not let positive Ganancias silently become a zero-return loss', () => {
    const p = ticket('Perdida');
    p.text += '\nGanancias S/5.00';
    expect(settlementEvidence(p)).toMatchObject({ conflictingAmounts: true, returned: undefined });
  });
  it('recognizes a terminal Betano Cash Out header without treating an offer as execution', () => {
    const p = ticket('Cash Out');
    p.text += '\nGanancias S/7.00';
    expect(settlementEvidence(p)).toMatchObject({
      candidate: true,
      kind: 'Cashout',
      executionNeedsConfirmation: true,
      returned: undefined,
      suggestedReturn: 700,
    });
    expect(
      settlementEvidence({ ...p, text: 'Betano\nSimple S/10.00\nCASH OUT S/7.00' }).candidate,
    ).toBe(false);
  });
  it('imports a fully settled ticket without inventing a missing global quote or potential', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Perdida');
      delete p.odds;
      delete p.potential;
      await registerCapture('upload', p, repo);
      const u = (await db.uploads.get('upload'))!;
      await confirmCaptureReview(
        'upload',
        {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: p.selections,
          acknowledged: true,
          historical: {
            kind: 'Perdida',
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            closedStake: 1000,
            returned: 0,
            fullClosureConfirmed: true,
            header: {
              house: 'Betano',
              kind: 'Combinada',
              stake: 1000,
              odds: null,
              potential: null,
            },
          },
        } as unknown as Parameters<typeof confirmCaptureReview>[1],
        repo,
      );
      const s = await repo.snapshot();
      expect(s.bets[0]).toMatchObject({ odds: null, potential: null, historical: true });
      expect(s.settlements).toHaveLength(1);
      expect(s.movements).toHaveLength(2);
      expect(totals(s).profit).toBe(-1000);
    }));
  it('reproduces the settled review block and requires an atomic confirmed import', async () =>
    fixture(async (db, repo) => {
      const p = ticket();
      await registerCapture('upload', p, repo);
      const u = (await db.uploads.get('upload'))!;
      expect(u.status).toBe('review');
      expect(await db.movements.count()).toBe(0);
      await confirmCaptureReview(
        'upload',
        {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: p.selections,
          acknowledged: true,
          historical: {
            kind: 'Ganada',
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            returned: 1400,
            closedStake: 1000,
            fullClosureConfirmed: true,
            header: { house: 'Betano', kind: 'Combinada', stake: 1000, odds: 4, potential: 4000 },
          },
        } as Parameters<typeof confirmCaptureReview>[1],
        repo,
      );
      const s = await repo.snapshot();
      expect(s.bets).toHaveLength(1);
      expect(s.settlements).toHaveLength(1);
      expect(s.movements).toHaveLength(2);
      expect(position(s.bets[0], s.settlements)).toMatchObject({
        status: 'Ganada',
        returned: 1400,
        profit: 400,
      });
      expect(totals(s).profit).toBe(400);
    }));
  it.each([
    ['Ganada', 14000, 4000],
    ['Perdida', 0, -10000],
    ['Cashout', 14000, 4000],
    ['Cashout', 7000, -3000],
    ['Cashout', 10000, 0],
    ['Cashout', 0, -10000],
  ] as const)(
    'imports %s with actual return %i and net %i exactly once',
    async (kind, returned, profit) =>
      fixture(async (db, repo) => {
        const p = ticket(kind === 'Cashout' ? '' : kind);
        p.stake = 10000;
        p.potential = 40000;
        p.text = p.text
          .replaceAll('S/10.00', 'S/100.00')
          .replaceAll('S/40.00', 'S/400.00')
          .replace(/^CASH OUT.*$/gm, '');
        if (kind === 'Cashout') p.text += '\nCashout cobrado S/' + (returned / 100).toFixed(2);
        else if (kind === 'Ganada') p.text += '\nPago final S/' + (returned / 100).toFixed(2);
        const image = await db.images.get('image');
        await registerCapture('upload', p, repo);
        const u = (await db.uploads.get('upload'))!;
        const c = {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: p.selections,
          acknowledged: true,
          historical: {
            kind,
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            closedStake: 10000,
            returned,
            fullClosureConfirmed: true as const,
            header: {
              house: 'Betano' as const,
              kind: 'Combinada' as const,
              stake: 10000,
              odds: 4,
              potential: 40000,
            },
          },
        };
        expect(await db.bets.count()).toBe(0);
        expect(settlementEvidence(p).returned).toBe(returned);
        await confirmCaptureReview('upload', c, repo);
        const before = await repo.snapshot();
        await confirmCaptureReview('upload', c, repo);
        expect(await repo.snapshot()).toEqual(before);
        expect(before.bets).toHaveLength(1);
        expect(before.settlements).toHaveLength(1);
        expect(before.movements).toHaveLength(2);
        expect(before.movements.map((m) => m.amount).sort((a, b) => a - b)).toEqual([
          -10000,
          returned,
        ]);
        expect(position(before.bets[0], before.settlements)).toMatchObject({
          status: kind,
          returned,
          profit,
        });
        expect(totals(before).profit).toBe(profit);
        expect(before.bets[0]).toMatchObject({
          date: c.historical.betDate,
          dateSource: 'manual',
          createdAt: u.createdAt,
        });
        expect(before.settlements[0].date).toBe(c.historical.settlementDate);
        expect(await db.images.get('image')).toEqual(image);
        const audit = before.audit.find((a) => a.action === 'Revisión humana de captura')!;
        expect(audit.before).toBe(c.expectedDraft);
        expect(JSON.parse(audit.after)).toMatchObject({
          historical: { kind, returned },
          uploadDate: u.createdAt,
          originalText: p.text,
        });
      }),
  );
  it.each([
    'offer',
    'missing-return',
    'partial',
    'closed-stake',
    'consent',
    'future',
    'chronology',
    'stale',
    'missing-potential',
    'preparation',
    'pending-bypass',
  ] as const)('retains unsafe historical import atomically: %s', async (fault) =>
    fixture(async (db, repo) => {
      const p = ticket('');
      p.text = p.text.replace(/^CASH OUT.*$/gm, '') + '\nCashout realizado';
      if (fault === 'offer') p.text = p.text.replace('Cashout realizado', 'CASH OUT S/80.00');
      if (fault === 'partial') p.text += '\nCashout parcial';
      if (fault === 'preparation') p.text += '\nCrear apuesta';
      if (fault === 'closed-stake') p.text += '\nStake cerrado S/5.00';
      await registerCapture('upload', p, repo);
      const u = (await db.uploads.get('upload'))!;
      const c = {
        expectedDraft: u.draftJson,
        imageId: 'image',
        selections: p.selections,
        acknowledged: true,
        historical: {
          kind: 'Cashout',
          betDate: '2026-10-20T15:00:00.000Z',
          settlementDate: '2026-10-21T18:00:00.000Z',
          closedStake: 1000,
          returned: 700,
          fullClosureConfirmed: true,
          header: { house: 'Betano', kind: 'Combinada', stake: 1000, odds: 4, potential: 4000 },
        },
      } as Parameters<typeof confirmCaptureReview>[1];
      if (fault === 'missing-return')
        delete (c.historical as Partial<NonNullable<typeof c.historical>>).returned;
      if (fault === 'consent') c.acknowledged = false;
      if (fault === 'future') c.historical!.settlementDate = '2099-01-01T00:00:00.000Z';
      if (fault === 'chronology') c.historical!.settlementDate = '2026-10-19T15:00:00.000Z';
      if (fault === 'stale') c.expectedDraft += ' ';
      if (fault === 'missing-potential')
        delete (c.historical!.header as Partial<NonNullable<typeof c.historical>['header']>)
          .potential;
      if (fault === 'pending-bypass') delete c.historical;
      const before = await repo.snapshot();
      await expect(confirmCaptureReview('upload', c, repo)).rejects.toThrow();
      expect(await repo.snapshot()).toEqual(before);
      expect(await db.movements.count()).toBe(0);
    }),
  );
  it('opens an already persisted legacy draft without OCR reread or upload', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Perdida');
      await db.uploads.update('upload', {
        status: 'review',
        reason: 'El boleto ya muestra estado global Perdida',
        draftJson: JSON.stringify(p),
      });
      const u = (await db.uploads.get('upload'))!;
      expect(canReviewCapture(readDraft(u.draftJson)!)).toBe(true);
      await confirmCaptureReview(
        'upload',
        {
          expectedDraft: u.draftJson,
          imageId: 'image',
          selections: p.selections,
          acknowledged: true,
          historical: {
            kind: 'Perdida',
            betDate: '2026-10-20T15:00:00.000Z',
            settlementDate: '2026-10-21T18:00:00.000Z',
            returned: 0,
            closedStake: 1000,
            fullClosureConfirmed: true,
            header: { house: 'Betano', kind: 'Combinada', stake: 1000, odds: 4, potential: 4000 },
          },
        },
        repo,
      );
      expect(await db.images.count()).toBe(1);
      expect(await db.uploads.count()).toBe(1);
      expect((await db.settlements.toArray())[0].kind).toBe('Perdida');
    }));
  it('two different images of the same ticket cannot create another financial record', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Perdida');
      await registerCapture('upload', p, repo);
      const first = (await db.uploads.get('upload'))!;
      const c = {
        expectedDraft: first.draftJson,
        imageId: 'image',
        selections: p.selections,
        acknowledged: true,
        historical: {
          kind: 'Perdida' as const,
          betDate: '2026-10-20T15:00:00.000Z',
          settlementDate: '2026-10-21T18:00:00.000Z',
          returned: 0,
          closedStake: 1000,
          fullClosureConfirmed: true as const,
          header: {
            house: 'Betano' as const,
            kind: 'Combinada' as const,
            stake: 1000,
            odds: 4,
            potential: 4000,
          },
        },
      };
      await confirmCaptureReview('upload', c, repo);
      const before = await repo.snapshot();
      await db.images.add({
        id: 'second-image',
        hash: 'other-pixels',
        name: 'other.png',
        blob: new Blob(['other']),
      });
      await db.uploads.add({ ...first, id: 'second', imageId: 'second-image' });
      await confirmCaptureReview('second', { ...c, imageId: 'second-image' }, repo);
      expect((await db.uploads.get('second'))?.status).toBe('duplicate');
      const after = await repo.snapshot();
      for (const k of ['bets', 'selections', 'movements', 'settlements'] as const)
        expect(after[k]).toEqual(before[k]);
    }));
  it.each([
    'CASH OUT S/80.00',
    'Cerrar apuesta S/80.00',
    'Cashout realizado si aceptas',
    'Cashout no realizado',
  ])('never treats %s as an execution receipt', (text) => {
    expect(settlementEvidence({ text: 'Betano\n' + text, house: 'Betano' }).kinds).not.toContain(
      'Cashout',
    );
  });
  it('does not substitute potential or an offered amount for a missing actual payout', () => {
    const p = ticket('');
    p.text += '\nCashout realizado';
    expect(settlementEvidence(p).returned).toBeUndefined();
  });
  it('retains exact dated evidence and rejects nonexistent calendar dates', () => {
    const p = ticket('Perdida');
    p.text +=
      '\nFecha de apuesta: 2026-10-20T10:00:32-05:00\nFecha de liquidación: 2026-10-21T12:30:45Z';
    expect(settlementEvidence(p)).toMatchObject({
      betDate: '2026-10-20T15:00:32.000Z',
      settlementDate: '2026-10-21T12:30:45.000Z',
    });
    p.text += '\nFecha de cierre: 2026-02-31T10:00:00Z';
    const invalid = settlementEvidence({ ...p, text: 'Fecha de apuesta: 2026-02-31T10:00:00Z' });
    expect(invalid.betDate).toBeUndefined();
  });
  it('holds partial receipts and conflicting closed stakes even without a complete execution badge', () => {
    expect(
      settlementEvidence({
        text: 'Betano\nCashout parcial S/70.00',
        house: 'Betano',
        stake: 10000,
      }),
    ).toMatchObject({ candidate: true, partial: true, kind: undefined });
    expect(
      settlementEvidence({
        text: 'Betano\nCashout cobrado S/70.00\nStake cerrado S/100.00\nStake cerrado S/50.00',
        house: 'Betano',
        stake: 10000,
      }).partial,
    ).toBe(true);
  });
  it('does not preselect a leg badge as a global result', () => {
    const p = ticket('');
    p.text += '\nGanada';
    expect(settlementEvidence(p)).toMatchObject({
      candidate: true,
      kind: undefined,
      manualState: true,
    });
  });
  it('reopens legacy errors without changing raw evidence, images or finances', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Perdida');
      await db.uploads.update('upload', {
        status: 'error',
        draftJson: JSON.stringify(p),
        reason: 'legacy',
      });
      const before = await db.uploads.get('upload');
      await reopenHistoricalCapture('upload', repo);
      await reopenHistoricalCapture('upload', repo);
      expect(await db.uploads.get('upload')).toEqual({ ...before, status: 'review' });
      expect(await db.audit.filter((a) => a.action === 'Reabrir borrador histórico').count()).toBe(
        1,
      );
      expect(await db.images.count()).toBe(1);
      expect(await db.bets.count()).toBe(0);
      expect(await db.movements.count()).toBe(0);
    }));
  it('rolls back the stake, master data and bet if settlement fails', async () =>
    fixture(async (db, repo) => {
      const p = ticket('Perdida');
      await registerCapture('upload', p, repo);
      const u = (await db.uploads.get('upload'))!;
      const before = await repo.snapshot();
      const spy = vi
        .spyOn(LocalRepository.prototype, 'settle')
        .mockRejectedValueOnce(Error('synthetic settlement failure'));
      try {
        await expect(
          confirmCaptureReview(
            'upload',
            {
              expectedDraft: u.draftJson,
              imageId: 'image',
              selections: p.selections,
              acknowledged: true,
              historical: {
                kind: 'Perdida',
                betDate: '2026-10-20T15:00:00.000Z',
                settlementDate: '2026-10-21T18:00:00.000Z',
                returned: 0,
                closedStake: 1000,
                fullClosureConfirmed: true,
                header: {
                  house: 'Betano',
                  kind: 'Combinada',
                  stake: 1000,
                  odds: 4,
                  potential: 4000,
                },
              },
            },
            repo,
          ),
        ).rejects.toThrow('synthetic settlement failure');
        expect(await repo.snapshot()).toEqual(before);
        expect((await db.uploads.get('upload'))?.status).toBe('review');
      } finally {
        spy.mockRestore();
      }
    }));
});
