// Real screen + intake + queue + OCR + financial boundary; RAM-only test adapter.
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Bets } from '../../src/pages/Bets';
import { repo } from '../../src/data/repository';
import { startCaptureQueue } from '../../src/data/captures';
import { readDraft } from '../../src/ocr/review';
import { Notices } from './context';
import { failUploadOnce } from './adapter';
import '../../src/styles.css';
import '../../src/visual-system.css';
await repo.init();
const stop = startCaptureQueue();
Object.assign(window, {
  captureQa: {
    snapshot: () => repo.snapshot(),
    uploads: () => repo.database.uploads.toArray(),
    stop,
    failUploadOnce,
    // Controlled fault injection for an unreadable input; never used by the app.
    async missingOdds(id: string) {
      const upload = (await repo.database.uploads.get(id))!;
      const draft = readDraft(upload.draftJson)!;
      draft.selections[0].odds = null;
      await repo.database.uploads.update(id, {
        status: 'review',
        draftJson: JSON.stringify(draft),
        reason: 'Cuota ausente (inyección QA sintética)',
      });
    },
    async repairImage(id: string, url: string) {
      const upload = (await repo.database.uploads.get(id))!;
      await repo.database.images.update(upload.imageId, { blob: await (await fetch(url)).blob() });
    },
  },
});
function Demo() {
  return (
    <main className="app-main" style={{ padding: 16 }}>
      <aside className="notice">
        QA aislado · sin Supabase · datos efímeros en memoria. Recargar descarta todo. Usa capturas
        de prueba desidentificadas.
      </aside>
      <Notices />
      <Bets />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Demo />
  </BrowserRouter>,
);
