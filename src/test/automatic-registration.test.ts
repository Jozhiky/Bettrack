import { it, expect, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from '../data/captures';
import { setAutomaticCaptures, automaticCapturePolicy } from '../data/automaticCapturePolicy';
import { agreedAutomaticEvidence, verifyAutomaticEvidence } from '../ocr/automaticEvidence';
import { readCapture } from '../ocr/readCapture';
import { totals, type CaptureUpload } from '../domain/model';
import { validateBackup } from '../data/transfer';
import type { ParsedTicket } from '../ocr/parser';
import { parseTicket } from '../ocr/parser';
import { CloudConflictError } from '../data/cloudStore';
import { retryCaptureConflict } from '../data/captureRetry';
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

export function automaticDraft(
  kind = 'Pendiente',
  reference: string | null = 'QA000001',
  returned = 1500,
): ParsedTicket {
  return {
    house: 'Betano',
    kind: 'Simple',
    stake: 1000,
    odds: 2,
    ...(kind === 'Pendiente' ? { potential: 2000, cashoutOffer: 700 } : {}),
    ticketReference: reference ?? undefined,
    expectedSelections: 1,
    text: [
      'Betano',
      `Simple S/10.00 ${kind === 'Pendiente' ? '2.00' : kind === 'Cashout' ? 'Cash Out' : kind}`,
      'Apuesta S/10.00',
      kind === 'Pendiente'
        ? 'Ganancias potenciales S/20.00\nCASH OUT S/7.00'
        : kind === 'Perdida'
          ? ''
          : `Ganancias S/${(returned / 100).toFixed(2)}`,
      ...(reference ? ['ID de apuesta: ' + reference] : []),
    ].join('\n'),
    selections: [
      {
        event: 'Equipo QA vs. Equipo QB',
        market: 'Goles totales Más/Menos',
        pick: 'Más de 2.5',
        odds: 2,
        sport: '',
        league: '',
      },
    ],
    warnings: [],
    reviewReasons: [],
    confidence: {},
  };
}
async function fixture(run: (d: BettrackDB, r: LocalRepository) => Promise<void>, enabled = true) {
  const d = new BettrackDB('automatic-registration-' + crypto.randomUUID());
  try {
    const r = new LocalRepository(d);
    await r.init();
    if (enabled) await setAutomaticCaptures(true, r, 'isolated-test');
    await run(d, r);
  } finally {
    await d.delete();
  }
}
async function seed(
  d: BettrackDB,
  p: ParsedTicket,
  id = 'u',
  proof = true,
  createdAt = new Date().toISOString(),
) {
  const bytes = new TextEncoder().encode(id),
    hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  if (proof) p.automaticEvidence = await agreedAutomaticEvidence(p, p, hash);
  await d.images.add({
    id: 'i-' + id,
    hash,
    name: 'synthetic.png',
    blob: new NodeBlob([bytes]) as unknown as Blob,
  });
  const u: CaptureUpload = {
    id,
    imageId: 'i-' + id,
    status: 'processing',
    createdAt,
    draftJson: '',
    reason: '',
    progress: 0,
  };
  await d.uploads.add(u);
  return { p, u, hash };
}
it('automatically records a complete pending wager, with one stake and no return or batch consent', async () =>
  fixture(async (d, r) => {
    const { p } = await seed(d, automaticDraft());
    await registerCapture('u', p, r);
    const s = await r.snapshot();
    expect(s.bets).toHaveLength(1);
    expect(s.movements).toHaveLength(1);
    expect(s.settlements).toHaveLength(0);
    expect(totals(s)).toMatchObject({ pending: 1, committed: 1000, profit: 0, cashouts: 0 });
    const audit = s.audit.find((a) => a.action === 'Registro automático de captura')!;
    expect(JSON.parse(audit.after)).toMatchObject({
      acknowledged: false,
      standingConsent: { ownerId: 'isolated-test' },
    });
    expect(JSON.parse((await d.uploads.get('u'))!.draftJson).humanReviewed).toBe(false);
  }));
it.each([
  ['Ganada', 1500, 500],
  ['Perdida', 0, -1000],
  ['Cashout', 1400, 400],
  ['Cashout', 700, -300],
  ['Cashout', 1000, 0],
])('automatically imports %s once with actual return %i', async (kind, returned, net) =>
  fixture(async (d, r) => {
    const { p } = await seed(d, automaticDraft(kind, 'QA000001', returned));
    await registerCapture('u', p, r);
    await registerCapture('u', p, r);
    const s = await r.snapshot();
    expect(s.bets).toHaveLength(1);
    expect(s.settlements).toHaveLength(1);
    expect(s.movements).toHaveLength(2);
    expect(s.settlements[0]).toMatchObject({ kind, returned });
    expect(totals(s).profit).toBe(net);
  }),
);
it('keeps the old manual flow when the account never activated automatic recording', async () =>
  fixture(async (d, r) => {
    const { p } = await seed(d, automaticDraft());
    await registerCapture('u', p, r);
    expect(await d.bets.count()).toBe(0);
    expect((await d.uploads.get('u'))!.status).toBe('review');
  }, false));
it.each([
  'missing-proof',
  'wrong-image',
  'changed-stake',
  'missing-amount',
  'partial',
  'review-reason',
])('does not write money for %s', async (issue) =>
  fixture(async (d, r) => {
    const { p } = await seed(d, automaticDraft('Cashout'), 'u', issue !== 'missing-proof');
    if (issue === 'wrong-image') p.automaticEvidence!.imageHash = 'b'.repeat(64);
    if (issue === 'changed-stake') p.stake = 2000;
    if (issue === 'missing-amount')
      p.text = p.text.replace(/Ganancias S\/15.00/, 'Ganancias ilegibles');
    if (issue === 'partial') p.text += '\nCashout parcial';
    if (issue === 'review-reason') p.reviewReasons = ['Participante ambiguo'];
    await registerCapture('u', p, r);
    expect(await d.bets.count()).toBe(0);
    expect(await d.movements.count()).toBe(0);
    expect((await d.uploads.get('u'))!.status).toBe('review');
  }),
);
it('requires the correct account and an auditable authorization, not just an enabled settings flag', async () =>
  fixture(async (d, r) => {
    const settings = (await d.settings.get('settings'))!;
    await d.settings.put({
      ...settings,
      automaticCaptures: {
        version: 'automatic-captures-v1',
        policyId: 'forged',
        ownerId: 'isolated-test',
        enabledAt: new Date().toISOString(),
      },
    });
    const { p } = await seed(d, automaticDraft());
    await registerCapture('u', p, r);
    expect(await d.bets.count()).toBe(0);
    await setAutomaticCaptures(true, r, 'another-account');
    expect(await automaticCapturePolicy(r)).toBeUndefined();
  }));
it('does not backfill older drafts and respects revocation even if stale settings reintroduce the old flag', async () =>
  fixture(async (d, r) => {
    const settings = (await d.settings.get('settings'))!,
      since = settings.automaticCaptures!.enabledAt;
    const { p } = await seed(
      d,
      automaticDraft(),
      'u',
      true,
      new Date(Date.parse(since) - 1000).toISOString(),
    );
    await registerCapture('u', p, r);
    expect(await d.bets.count()).toBe(0);
    await setAutomaticCaptures(false, r, 'isolated-test');
    await d.settings.put(settings);
    expect(await automaticCapturePolicy(r)).toBeUndefined();
    const next = await seed(d, automaticDraft(), 'new');
    await registerCapture('new', next.p, r);
    expect(await d.bets.count()).toBe(0);
  }));
it('applies a later result to the same visible reference without a second stake', async () =>
  fixture(async (d, r) => {
    const first = await seed(d, automaticDraft(), 'pending');
    await registerCapture('pending', first.p, r);
    const second = await seed(d, automaticDraft('Ganada'), 'result');
    await registerCapture('result', second.p, r);
    const s = await r.snapshot();
    expect(s.bets).toHaveLength(1);
    expect(s.settlements).toHaveLength(1);
    expect(s.movements).toHaveLength(2);
    expect(totals(s)).toMatchObject({ won: 1, pending: 0, profit: 500 });
    expect((await d.uploads.get('result'))!.status).toBe('linked');
    const repeat = await seed(d, automaticDraft('Ganada'), 'repeat');
    await registerCapture('repeat', repeat.p, r);
    expect(await d.movements.count()).toBe(2);
  }));
it('does not settle the same reference when an individual leg quote changed under an unknown total', async () =>
  fixture(async (d, r) => {
    const a = await seed(d, automaticDraft(), 'a');
    await registerCapture('a', a.p, r);
    const changed = automaticDraft('Ganada');
    delete changed.odds;
    changed.selections[0].odds = 1.8;
    const b = await seed(d, changed, 'b');
    await registerCapture('b', b.p, r);
    expect(await d.settlements.count()).toBe(0);
    expect(await d.movements.count()).toBe(1);
    expect((await d.uploads.get('b'))!.reason).toContain('difieren');
  }));
it('does not settle a possible existing wager from matching terms without a common reference', async () =>
  fixture(async (d, r) => {
    const a = await seed(d, automaticDraft('Pendiente', null), 'a');
    await registerCapture('a', a.p, r);
    const b = await seed(d, automaticDraft('Ganada', null), 'b');
    await registerCapture('b', b.p, r);
    expect(await d.bets.count()).toBe(1);
    expect(await d.settlements.count()).toBe(0);
    expect(await d.movements.count()).toBe(1);
    expect((await d.uploads.get('b'))!.reason).toContain('referencia común');
  }));
it('keeps distinct explicit references separate despite equal amounts and selections', async () =>
  fixture(async (d, r) => {
    for (const key of ['QA000001', 'QA000002']) {
      const { p } = await seed(d, automaticDraft('Pendiente', key), key);
      await registerCapture(key, p, r);
    }
    expect(await d.bets.count()).toBe(2);
    expect(await d.movements.count()).toBe(2);
  }));
it('guards concurrent same-reference confirmations and refuses a conflicting final result', async () =>
  fixture(async (d, r) => {
    const a = await seed(d, automaticDraft('Ganada'), 'a'),
      b = await seed(d, automaticDraft('Ganada'), 'b');
    await Promise.all([registerCapture('a', a.p, r), registerCapture('b', b.p, r)]);
    expect(await d.bets.count()).toBe(1);
    expect(await d.movements.count()).toBe(2);
    const c = await seed(d, automaticDraft('Perdida'), 'c');
    await registerCapture('c', c.p, r);
    expect(await d.movements.count()).toBe(2);
    expect((await d.uploads.get('c'))!.reason).toContain('contradice');
  }));
it('requires two agreeing actual passes in automatic mode and invalidates disagreements', async () => {
  const good =
    'Betano\nSimple S/10.00 2.00\nApuesta aceptada\nEquipo QA vs. Equipo QB\nGoles totales Más/Menos\nMás de 2.5\n2.00\nApuesta S/10.00\nGanancias potenciales S/20.00';
  const result = (text: string) => ({ text, lines: [], symbols: [], confidence: 95 });
  const recognize = vi.fn().mockResolvedValue(result(good)),
    reader = { recognize, terminate: vi.fn() };
  const blob = new NodeBlob(['synthetic']) as unknown as Blob;
  expect((await readCapture(reader, blob, () => {}, false, true)).automaticEvidence).toBeDefined();
  expect(recognize).toHaveBeenCalledTimes(2);
  recognize
    .mockReset()
    .mockResolvedValueOnce(result(good))
    .mockResolvedValueOnce(result(good.replace('Equipo QA', 'Equipo QC')));
  expect(
    (await readCapture(reader, blob, () => {}, false, true)).automaticEvidence,
  ).toBeUndefined();
});
it('does not restore a standing financial authorization from a backup', async () =>
  fixture(async (d, r) => {
    const backup = {
      format: 'bettrack',
      version: 1,
      createdAt: new Date().toISOString(),
      data: await r.snapshot(),
      settings: await d.settings.get('settings'),
      uploads: [],
      images: [],
    };
    expect(validateBackup(backup).settings).not.toHaveProperty('automaticCaptures');
  }));
it('extracts only explicit unambiguous wager references, never event numbers', () => {
  expect(parseTicket('Betano\nID de apuesta: QA000123').ticketReference).toBe('QA000123');
  expect(parseTicket('Betano\n1D de apuesta: QA000123').ticketReference).toBe('QA000123');
  expect(parseTicket('Betano\nID de evento: QA000123').ticketReference).toBeUndefined();
  expect(
    parseTicket('Betano\nID de apuesta: QA000123\nID de apuesta: QA000456').ticketReference,
  ).toBeUndefined();
});
it('refuses a reference match with a different account currency', async () =>
  fixture(async (d, r) => {
    const a = await seed(d, automaticDraft(), 'a');
    await registerCapture('a', a.p, r);
    await d.houses.update('house-0', { currency: 'USD' });
    const b = await seed(d, automaticDraft('Ganada'), 'b');
    await registerCapture('b', b.p, r);
    expect(await d.movements.count()).toBe(1);
    expect((await d.uploads.get('b'))!.reason).toContain('otra moneda');
  }));
it('retries only explicit cloud conflicts, caps attempts and never retries an unknown commit outcome', async () => {
  const eventual = vi
    .fn()
    .mockRejectedValueOnce(new CloudConflictError())
    .mockResolvedValue('current-state');
  expect(await retryCaptureConflict(eventual)).toBe('current-state');
  expect(eventual).toHaveBeenCalledTimes(2);
  const unknown = vi.fn().mockRejectedValue(Error('Lost response'));
  await expect(retryCaptureConflict(unknown)).rejects.toThrow('Lost response');
  expect(unknown).toHaveBeenCalledOnce();
  const persistent = vi.fn().mockRejectedValue(new CloudConflictError());
  await expect(retryCaptureConflict(persistent)).rejects.toBeInstanceOf(CloudConflictError);
  expect(persistent).toHaveBeenCalledTimes(4);
});
it('preserves full OCR if financial persistence fails, then safely retries the draft', async () =>
  fixture(async (d, r) => {
    const { p } = await seed(d, automaticDraft('Ganada'));
    const fail = vi
      .spyOn(LocalRepository.prototype, 'saveBet')
      .mockRejectedValueOnce(Error('Synthetic persistence failure'));
    try {
      await expect(registerCapture('u', p, r)).rejects.toThrow('Synthetic persistence failure');
      expect(JSON.parse((await d.uploads.get('u'))!.draftJson).text).toBe(p.text);
      expect(await d.bets.count()).toBe(0);
      expect(await d.movements.count()).toBe(0);
      await registerCapture('u', p, r);
      expect(await d.bets.count()).toBe(1);
      expect(await d.movements.count()).toBe(2);
    } finally {
      fail.mockRestore();
    }
  }));
it('recovers only a missing offer from a matching contrast footer; execution, mismatches and changed selections stay blocked', () => {
  const a = automaticDraft(),
    b = {
      ...automaticDraft(),
      cashoutOffer: undefined,
      text: automaticDraft().text.replace('\nCASH OUT S/7.00', ''),
    },
    hash = 'a'.repeat(64);
  expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
  const proof = agreedAutomaticEvidence(a, b, hash, 'CASH OUT S/7.00');
  expect(proof).toBeDefined();
  expect(verifyAutomaticEvidence({ ...a, automaticEvidence: proof }, hash)).toBe(true);
  expect(agreedAutomaticEvidence(a, b, hash, 'CASH OUT S/6.00')).toBeUndefined();
  expect(
    agreedAutomaticEvidence(a, b, hash, 'CASH OUT S/7.00\nCashout realizado S/7.00'),
  ).toBeUndefined();
  expect(
    agreedAutomaticEvidence(a, { ...b, text: b.text + '\nCrear apuesta' }, hash, 'CASH OUT S/7.00'),
  ).toBeUndefined();
  expect(
    agreedAutomaticEvidence(
      a,
      { ...b, selections: [{ ...b.selections[0], pick: 'Más de 3.5' }] },
      hash,
      'CASH OUT S/7.00',
    ),
  ).toBeUndefined();
  expect(
    verifyAutomaticEvidence(
      { ...a, automaticEvidence: { ...proof!, placementRead: 'CASH OUT S/6.00' } },
      hash,
    ),
  ).toBe(false);
});
