// Entirely synthetic artwork. No private ticket, account or real event is copied to QA.
export async function selectionResultImage(page, kind) {
  const buffer = Buffer.from(
    await page.evaluate((kind) => {
      const c = document.createElement('canvas'),
        builder = kind === 'Builder',
        combo = kind === 'Combinada';
      c.width = 720;
      c.height = combo ? 1400 : builder ? 1000 : 720;
      const x = c.getContext('2d');
      x.fillStyle = '#202436';
      x.fillRect(0, 0, c.width, c.height);
      const text = (s, px, y, size = 26) => {
        x.fillStyle = 'white';
        x.font = `bold ${size}px Arial`;
        x.fillText(s, px, y);
      };
      text('Betano', 50, 60, 34);
      text(`${combo ? 'Combinada de 3' : 'Simple'} S/15.00`, 50, 120);
      text(combo ? '8.00' : '2.00', 625, 120);
      const mark = (pick, y, status, left = 100) => {
        x.font = 'bold 26px Arial';
        const cx = left + x.measureText(pick).width + 20,
          cy = y - 10;
        x.fillStyle = status === 'lost' ? '#ff0050' : '#00cf65';
        x.beginPath();
        x.arc(cx, cy, 12, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#202436';
        x.lineWidth = 3;
        x.lineCap = 'round';
        x.beginPath();
        if (status === 'lost') {
          x.moveTo(cx - 5, cy - 5);
          x.lineTo(cx + 5, cy + 5);
          x.moveTo(cx - 5, cy + 5);
          x.lineTo(cx + 5, cy - 5);
        } else {
          x.moveTo(cx - 6, cy);
          x.lineTo(cx - 2, cy + 4);
          x.lineTo(cx + 6, cy - 6);
        }
        x.stroke();
      };
      if (builder) {
        text('Bet Builder', 100, 200);
        text('2.00', 625, 200);
        text('Equipo QA', 100, 250);
        text('Equipo QB', 100, 290);
        [
          ['Más de 2.5', 'Goles totales Más/Menos'],
          ['Más de 1.5', 'Tarjetas Totales Más/Menos'],
          ['Más de 25.5', 'Remates totales'],
        ].forEach(([pick, market], i) => {
          const y = 370 + i * 140;
          text(pick, 140, y);
          text(market, 140, y + 42, 22);
          x.strokeStyle = '#ff6633';
          x.lineWidth = 2;
          x.beginPath();
          x.arc(112, y - 9, 8, 0, Math.PI * 2);
          x.stroke();
          if (i === 1) mark(pick, y, 'won', 140);
        });
      } else {
        for (let i = 0; i < (combo ? 3 : 1); i++) {
          const y = 210 + i * 280,
            pick = i === 0 ? 'Más de 4.5' : i === 1 ? 'Más de 1.5' : 'Más de 2.5';
          text(pick, 100, y);
          text('2.00', 625, y);
          if (!i) mark(pick, y, 'lost');
          text('Goles totales Más/Menos', 100, y + 50, 22);
          text('Equipo QA' + i, 100, y + 100);
          text('Equipo QB' + i, 100, y + 145);
        }
      }
      text('Apuesta', 50, c.height - 180);
      text('S/15.00', 590, c.height - 180);
      text('Ganancias potenciales', 50, c.height - 125, 24);
      text(builder ? 'S/30.00' : 'S/0.00', 590, c.height - 125);
      text('ID de apuesta: QAVISUAL' + (combo ? 'B' : builder ? 'C' : 'A'), 50, c.height - 55, 24);
      return c.toDataURL('image/png').split(',')[1];
    }, kind),
    'base64',
  );
  return { name: `synthetic-selection-${kind}.png`, mimeType: 'image/png', buffer };
}
