// Remove only synthetic accounts named in the ignored QA registry.
// The resulting SQL still needs the owner's administrative connector/SQL editor.
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { accounts, login, reset } from './cloud-qa.mjs';
assert(accounts.length > 0, 'No QA registry');
for (const account of accounts) {
  assert.match(account.id,/^[0-9a-f-]{36}$/);
  assert.match(account.username,/^btqa_[0-9a-f]{12}$/);
  assert.equal(account.email,`${account.username}@users.bettrack.invalid`);
  const api = await login(account);
  await reset(api);
  const listed=await api.storage.from('bettrack-captures').list(account.id,{limit:1000});
  if(listed.error) throw listed.error;
  if(listed.data.length){
    const removed=await api.storage.from('bettrack-captures').remove(listed.data.map(item=>`${account.id}/${item.name}`));
    if(removed.error) throw removed.error;
  }
  const signedOut=await api.auth.signOut(); if(signedOut.error) throw signedOut.error;
}
const matches=accounts.map(a=>`(id='${a.id}'::uuid and email='${a.email}' and raw_user_meta_data->>'username'='${a.username}')`).join(' or ');
const ids=accounts.map(a=>`'${a.id}'::uuid`).join(',');
const sql=`begin;
do $$ begin
 if exists(select 1 from auth.users where id in (${ids}) and not (${matches})) then raise exception 'QA identity mismatch'; end if;
 if exists(select 1 from storage.objects where bucket_id='bettrack-captures' and split_part(name,'/',1) in (${accounts.map(a=>`'${a.id}'`).join(',')})) then raise exception 'Remove QA objects using Storage API first'; end if;
end $$;
delete from auth.sessions where user_id in (select id from auth.users where ${matches});
delete from auth.users where ${matches};
commit;
select count(*) as remaining_qa_users from auth.users where id in (${ids});
`;
await writeFile('.env.qa-cleanup.sql',sql);
console.log(`QA objects removed and sessions revoked for ${accounts.length} synthetic accounts. Scoped account deletion saved in .env.qa-cleanup.sql.`);
