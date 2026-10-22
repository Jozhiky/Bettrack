import type { Page } from '@playwright/test';
export async function syntheticImage(page: Page, event = 'Alianza vs Universitario', footer = '') {
  const image = await page.evaluate(
    ({ event, footer }) => {
      const c = document.createElement('canvas');
      c.width = 1000;
      c.height = 900;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1000, 900);
      ctx.fillStyle = 'black';
      ctx.font = '36px Arial';
      [
        'BETANO',
        'Apuesta Simple',
        event,
        'Goles del partido',
        'Mas de 2.5',
        'Cuota total: 2.00',
        'Importe apostado S/ 10.00',
        'Retorno potencial S/ 20.00',
      ]
        .concat(footer ? [footer] : [])
        .forEach((l, i) => ctx.fillText(l, 50, 80 + i * 90));
      return c.toDataURL('image/png').split(',')[1];
    },
    { event, footer },
  );
  return { name: 'ticket.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
}
export async function uploadSynthetic(page: Page, event?: string) {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await syntheticImage(page, event));
}
