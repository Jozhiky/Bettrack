// Disposable QA accounts only. Never point this registry at a real member.
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
export const url = 'https://wfrpqzyokzrstafuqujf.supabase.co';
export const key = 'sb_publishable_Cw2igNt5de-7OotH61NYGw_UcWbXQ3w';
export const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export const accounts = JSON.parse(await readFile('.env.qa.json', 'utf8').catch(error => { if(error.code==='ENOENT') return '[]'; throw error; }));
if (process.argv[2] === 'provision') {
  assert.equal(accounts.length,0,'Existing QA registry found; use or clean it first.');
  for(let index=0;index<2;index++) {
    const username='btqa_'+randomBytes(6).toString('hex');
    const account={username,email:`${username}@users.bettrack.invalid`,password:randomBytes(20).toString('hex'),id:''};
    accounts.push(account); await writeFile('.env.qa.json',JSON.stringify(accounts));
    const api=client(); const result=await api.auth.signUp({email:account.email,password:account.password,options:{data:{username}}});
    if(result.error) throw result.error;
    assert(result.data.session,'Direct signup must be enabled');
    account.id=result.data.user.id; await writeFile('.env.qa.json',JSON.stringify(accounts));
    await api.auth.signOut();
  }
  console.log('Two disposable QA accounts created; credentials remain in ignored local registry.');
}
export async function login(account) {
  assert.match(account.username, /^btqa_/);
  const api = client();
  const { data, error } = await api.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw error;
  assert.equal(data.user.id, account.id);
  return api;
}
export async function reset(api) {
  const { data, error } = await api.rpc('bt_snapshot');
  if (error) throw error;
  const changes = Object.entries(data.records).flatMap(([collection, rows]) => collection === 'audit' ? [] : rows.map(row => ({ collection, id: row.id, payload: null })));
  if (changes.length) {
    const result = await api.rpc('bt_commit', { expected_version: data.version, changes });
    if (result.error) throw result.error;
  }
  const pending = await api.from('bt_storage_cleanup').select('path');
  if (pending.error) throw pending.error;
  if (pending.data.length) {
    const paths = pending.data.map(row => row.path);
    const result = await api.storage.from('bettrack-captures').remove(paths);
    if (result.error) throw result.error;
    const removed = await api.from('bt_storage_cleanup').delete().in('path', paths);
    if (removed.error) throw removed.error;
  }
}
if (process.argv[2] === 'reset') {
  for (const account of accounts) { const api = await login(account); await reset(api); await api.auth.signOut(); }
  console.log('Disposable QA data reset; audit preserved.');
}
if (process.argv[2] === 'security') {
  const [a,b] = await Promise.all(accounts.slice(0,2).map(login));
  const anon = client();
  const passed = [];
  const deny = (r, label) => { assert(r.error, label); passed.push(label); };
  deny(await anon.rpc('bt_snapshot'), 'Anonymous snapshot denied');
  deny(await anon.rpc('bt_commit', { expected_version: 0, changes: [] }), 'Anonymous commit denied');
  const before = await a.rpc('bt_snapshot'); assert.ifError(before.error);
  const snap = before.data;
  assert(snap.records.bets.length, 'Run OCR flow first to exercise real records');
  const bet = snap.records.bets[0], house = snap.records.houses.find(h => h.id === bet.houseId);
  const otherRows = await b.from('bt_bets').select('*').eq('user_id', accounts[0].id);
  assert.ifError(otherRows.error); assert.equal(otherRows.data.length,0); passed.push('Other user rows isolated');
  deny(await b.from('bt_bets').insert({ user_id: accounts[0].id, id:'forbidden', payload:bet }), 'Direct cross-user writes denied');
  deny(await a.from('bt_bets').update({ payload:bet }).eq('id',bet.id), 'Direct owner writes denied outside transaction');
  const image = snap.records.images[0]; assert(image);
  deny(await b.storage.from('bettrack-captures').download(image.path), 'Other user image download denied');
  const publicImage = await fetch(`${url}/storage/v1/object/public/bettrack-captures/${image.path}`);
  assert(!publicImage.ok); passed.push('Public image access denied');
  deny(await b.storage.from('bettrack-captures').upload(`${accounts[0].id}/forbidden`,new Blob(['x'],{type:'image/png'})), 'Other user image upload denied');
  const rejectChanges = async (changes,label) => {
    deny(await a.rpc('bt_commit',{expected_version:snap.version,changes}),label);
    const after = await a.rpc('bt_snapshot'); assert.ifError(after.error);
    assert.deepEqual(after.data,snap,`${label}: rollback must preserve all data and version`);
  };
  await rejectChanges([{collection:'bets',id:bet.id,payload:{...bet,stake:bet.stake+1}}], 'Unbalanced stake rolled back');
  await rejectChanges([{collection:'houses',id:house.id,payload:null}], 'Referenced wallet deletion rolled back');
  await rejectChanges([{collection:'movements',id:'qa-overdraft',payload:{id:'qa-overdraft',houseId:house.id,date:new Date().toISOString(),kind:'Retiro',amount:-100000000000}}], 'Overdraft withdrawal rolled back');
  if (snap.records.settlements[0]) {
    const row = snap.records.settlements[0];
    await rejectChanges([{collection:'settlements',id:row.id,payload:{...row,returned:row.returned+1}}], 'Unbalanced cashout rolled back');
  }
  if (snap.records.audit[0]) await rejectChanges([{collection:'audit',id:snap.records.audit[0].id,payload:null}], 'Audit deletion denied');
  const change = [{collection:'streamers',id:'qa-concurrency',payload:{id:'qa-concurrency',name:'QA concurrency',active:true}}];
  const race = await Promise.all([a.rpc('bt_commit',{expected_version:snap.version,changes:change}),a.rpc('bt_commit',{expected_version:snap.version,changes:change})]);
  assert.equal(race.filter(r=>!r.error).length,1); assert(race.find(r=>r.error)?.error.message.includes('BT_CONFLICT'));
  passed.push('Concurrent writes: exactly one commit; stale write rejected');
  const latest = await a.rpc('bt_snapshot'); assert.ifError(latest.error);
  assert.equal(latest.data.version,snap.version+1);
  console.log(JSON.stringify({passed:passed.length,checks:passed},null,2));
  await Promise.all([a.auth.signOut(),b.auth.signOut()]);
}
