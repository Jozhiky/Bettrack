import { z } from 'zod';
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,23}$/, 'Usa de 3 a 24 caracteres: empieza con una letra y utiliza letras, números, punto, guion o guion bajo.');
export function usernameEmail(username: string) {
  return `${usernameSchema.parse(username)}@users.bettrack.invalid`;
}
