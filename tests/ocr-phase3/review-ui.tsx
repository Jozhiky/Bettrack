// Isolated visual fixture. All persistence actions are replaced by the runner.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CapturePending } from '../../src/components/CapturePending';
import corpus from '../ocr-phase1/cases.json';
import '../../src/styles.css';
import '../../src/visual-system.css';
const image = await (await fetch('/tests/ocr-phase1/images/timed-goal.png')).blob();
Object.assign(window, { __fixtureImage: { id: 'qa-image', name: 'Comprobante QA', blob: image } });
const expected = corpus.cases[0].expected;
const draft = {
  ...expected,
  text: 'Betano\nCASH OUT S/8.90',
  warnings: [],
  confidence: {},
  selections: expected.selections.map((s) => ({ ...s, sport: '', league: '', odds: null })),
};
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <main style={{ maxWidth: 900, margin: '20px auto', padding: 16 }}>
      <h1>QA aislado · revisión de captura</h1>
      <CapturePending
        upload={{
          id: 'qa',
          imageId: 'qa-image',
          status: 'review',
          progress: 100,
          createdAt: '2026-01-01T12:00:00Z',
          reason: 'Cuota ausente',
          draftJson: JSON.stringify(draft),
        }}
        onSelect={() => {}}
      />
    </main>
  </React.StrictMode>,
);
