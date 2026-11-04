import test from 'node:test';
import assert from 'node:assert/strict';
import { SolidRPC } from '../src/client.mjs';
const token = `sa_${'1'.repeat(64)}`;
test('management origin, path, token and redirect boundaries', async () => {
  let call;
  const client = new SolidRPC({token, fetch:async (...args) => {call=args;return Response.json({id:'key'});}});
  assert.equal((await client.createKey('App','stable-idempotency-key')).id,'key');
  assert.equal(call[0],'https://api.solidrpc.io/agent/v1/keys');
  assert.equal(call[1].headers.Authorization,`Bearer ${token}`);
  assert.equal(call[1].headers['Idempotency-Key'],'stable-idempotency-key');
  assert.equal(call[1].redirect,'error');
  await client.request('GET','/openapi.json');
  assert.equal(call[0],'https://api.solidrpc.io/agent/v1/openapi.json');
  for(const url of ['http://evil.example','https://evil.example','https://api.solidrpc.io/path','https://user@api.solidrpc.io','https://api.solidrpc.io/?x=1']) assert.throws(()=>new SolidRPC({url,token}));
  for(const path of ['//evil.example','/../auth','/keys#fragment','/%2e%2e/auth','/keys\\evil']) await assert.rejects(client.request('GET',path));
  assert.throws(()=>new SolidRPC({token:'ak_wrong'}),/sa_ management/);
});
test('read-only mode rejects mutations before network and terms require explicit input', async()=>{
  let calls=0;
  const client=new SolidRPC({readOnly:true,fetch:async()=>{calls++;return Response.json({});}});
  await assert.rejects(client.createKey('App','idempotency-key'),/Read-only/);
  assert.equal(calls,0);
  assert.throws(()=>client.provision('owner@example.com',token),/termsRevision/);
  await client.networks(); assert.equal(calls,1);
});
test('structured scope errors and non-JSON edge responses remain diagnosable',async()=>{
  const denied=new SolidRPC({fetch:async()=>Response.json({code:'INSUFFICIENT_SCOPE',error:'Missing keys:write'},{status:403})});
  await assert.rejects(denied.createKey('App','idempotency-key'),e=>e.status===403&&e.code==='INSUFFICIENT_SCOPE');
  const html=new SolidRPC({fetch:async()=>new Response('<html>edge</html>',{status:502})});
  await assert.rejects(html.networks(),e=>e.status===502&&/expected a JSON/.test(e.message));
});

test('read-only blocks secret reads and credential reads before fetch',async()=>{
 let count=0;const c=new SolidRPC({readOnly:true,fetch:async()=>{count++;return Response.json({});}});
 for(const p of ['/keys/example/secret','/KEYS/example/secret/?x=1','/credentials','/credentials/current','//credentials//rotate','/./credentials/current','/keys/example/./secret','/credentials/.'])await assert.rejects(c.request('GET',p),/Read-only/);
 assert.equal(count,0);
});
test('null and scalar error responses preserve HTTP status without secondary crashes',async()=>{
 for(const body of [null,'upstream error',17]){
  const c=new SolidRPC({fetch:async()=>Response.json(body,{status:502})});await assert.rejects(c.networks(),e=>e.status===502&&e.message==='HTTP 502');
 }
});
