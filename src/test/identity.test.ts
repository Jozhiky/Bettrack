import { describe, it, expect, afterEach } from 'vitest';
import { usernameEmail, usernameSchema } from '../domain/identity';
import { cookieStorage } from '../integrations/supabase';
import { canonicalJSON } from '../data/jsonEquality';

describe('identidad y sesión cloud',()=>{
  it('compara respaldos JSONB sin falsos conflictos por orden de claves',()=>{
    expect(canonicalJSON({id:'1',nested:{b:2,a:1},rows:[1,2]})).toBe(canonicalJSON({rows:[1,2],nested:{a:1,b:2},id:'1'}));
    expect(canonicalJSON({rows:[1,2]})).not.toBe(canonicalJSON({rows:[2,1]}));
  });
  afterEach(()=>cookieStorage.removeItem('qa-auth'));
  it('normaliza el usuario para impedir identidades distintas por mayúsculas',()=>{
    expect(usernameEmail('  Richard_1 ')).toBe('richard_1@users.bettrack.invalid');
  });
  it('rechaza correos, espacios internos, caracteres no permitidos y longitudes inválidas',()=>{
    for(const value of ['ab','9richard','richard@gmail.com','rich ard','r'.repeat(25),'ric<script>']) expect(usernameSchema.safeParse(value).success).toBe(false);
  });
  it('conserva una sesión grande con caracteres multibyte entre fragmentos',()=>{
    const value=JSON.stringify({token:'ñ🔐'.repeat(1200)});
    cookieStorage.setItem('qa-auth',value);
    expect(cookieStorage.getItem('qa-auth')).toBe(value);
    cookieStorage.setItem('qa-auth','short');
    expect(cookieStorage.getItem('qa-auth')).toBe('short');
    expect(document.cookie).not.toContain('qa-auth.1=');
  });
  it('elimina la sesión sin borrar cookies ajenas',()=>{
    document.cookie='unrelated=keep; Path=/';
    cookieStorage.setItem('qa-auth','session');
    cookieStorage.removeItem('qa-auth');
    expect(cookieStorage.getItem('qa-auth')).toBeNull();
    expect(document.cookie).toContain('unrelated=keep');
    document.cookie='unrelated=; Path=/; Max-Age=0';
  });
});
