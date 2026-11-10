import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, stat, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const cli=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
const token=`sa_${'2'.repeat(64)}`;
const replacement=`sa_${'3'.repeat(64)}`;
async function fixture(t, options = {}){
 const dir=await mkdtemp(path.join(tmpdir(),'solidrpc-test-')); const calls=[];
 let lost=false;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const b of req)raw+=b;
  calls.push({method:req.method,path:req.url,auth:req.headers.authorization,body:raw?JSON.parse(raw):null});
  res.setHeader('Content-Type','application/json');
  if(req.url.endsWith('/accounts')) {
   if(!lost){lost=true;req.socket.destroy();return;}
   res.end(JSON.stringify({accountId:'fixture',status:'pending_funding'}));return;
  }
  if(![`Bearer ${token}`,`Bearer ${replacement}`].includes(req.headers.authorization)){res.statusCode=401;res.end(JSON.stringify({error:'Invalid management credential',code:'UNAUTHORIZED'}));return;}
  if(req.url.endsWith('/credentials/rotate')){res.end(JSON.stringify(raw.includes('malformed-fixture')?{id:'new'}:{id:'new',token:replacement,scopes:['keys:read'],bootstrap:false}));return;}
  if(req.method==='DELETE' && options.failRetire && calls.filter(c=>c.method==='DELETE').length===1){res.statusCode=options.retireStatus || 503;res.end(JSON.stringify({error:'Unavailable'}));return;}
  res.end(JSON.stringify({networks:[{chainId:1}]}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 const env={PATH:process.env.PATH,SOLIDRPC_CONFIG_DIR:dir,SOLIDRPC_URL:url};
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 return {dir,calls,url,env};
}
async function run(env,args,input){
 const child=spawn(process.execPath,[cli,...args],{env,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.stdin.end(input?JSON.stringify(input):'');const [code]=await once(child,'close');return {code,out,err};
}
test('provision persists bootstrap before a lost reply and retry reuses it',async(t)=>{
 const f=await fixture(t);const input={email:'owner@example.com',termsRevision:'owner-reviewed-fixture',acceptTerms:true};
 const bad=await run(f.env,['provision'],{email:input.email});assert.equal(bad.code,1);assert.equal(f.calls.length,0);
 const first=await run(f.env,['provision'],input);assert.equal(first.code,1);
 const stored=JSON.parse(await readFile(path.join(f.dir,'default.json'),'utf8'));
 const retry=await run(f.env,['provision'],input);assert.equal(retry.code,0);
 assert.equal(f.calls[0].body.bootstrapSecret,stored.token);assert.equal(f.calls[1].body.bootstrapSecret,stored.token);
 assert.ok(!retry.out.includes(stored.token));
 assert.equal((await stat(path.join(f.dir,'default.json'))).mode&0o777,0o600);
 assert.equal((await stat(f.dir)).mode&0o777,0o700);
});
test('external token file does not get rotated or leaked',async(t)=>{
 const f=await fixture(t);const file=path.join(f.dir,'management.key');await writeFile(file,token,{mode:0o600});
 const env={...f.env,SOLIDRPC_TOKEN_FILE:file};
 const read=await run(env,['request','GET','/networks']);assert.equal(read.code,0);assert.ok(!read.out.includes(token));
 const rotate=await run(env,['rotate']);assert.equal(rotate.code,1);assert.match(rotate.err,/External token/);assert.equal(f.calls.length,1);
});
test('a blank external token file cannot fall back to a managed profile', async (t) => {
 const f = await fixture(t);
 assert.equal((await run(f.env, ['login'], { token })).code, 0);
 const file = path.join(f.dir, 'management.key');
 await writeFile(file, ' \n', { mode: 0o600 });
 const env = { ...f.env, SOLIDRPC_TOKEN_FILE: file };
 for (const args of [['request', 'GET', '/me'], ['rotate']]) {
  const result = await run(env, args);
  assert.equal(result.code, 1);
  assert.match(result.err, /token file is empty/i);
  assert.equal(f.calls.length, 0);
 }
});
test('rotation saves replacement then revokes old token and origin changes fail closed',async(t)=>{
 const f=await fixture(t);await run(f.env,['login'],{token});
 const switched=await run({...f.env,SOLIDRPC_URL:'https://api.solidrpc.io'},['request','GET','/me']);assert.equal(switched.code,1);assert.equal(f.calls.length,0);
 const result=await run(f.env,['rotate']);assert.equal(result.code,0);
 assert.equal(JSON.parse(await readFile(path.join(f.dir,'default.json'),'utf8')).token,replacement);
 assert.deepEqual(f.calls.map(c=>c.path),['/agent/v1/credentials/rotate','/agent/v1/credentials/current']);
 assert.equal(f.calls[1].auth,`Bearer ${token}`);assert.ok(!result.out.includes(replacement));
});
test('stdio MCP initializes in two fresh processes, reads and blocks generic and named writes',async(t)=>{
 const f=await fixture(t);
 for(let i=0;i<2;i++){
  const transport=new StdioClientTransport({command:process.execPath,args:[cli,'mcp'],env:{...f.env,SOLIDRPC_TOKEN:token,SOLIDRPC_READ_ONLY:'1'},stderr:'pipe'});
  const client=new Client({name:'qualification',version:'1.0.0'});await client.connect(transport);
  try{
   const list=await client.listTools();assert.equal(list.tools.length,9);
   const networks=await client.callTool({name:'solidrpc_networks',arguments:{}});assert.ok(!networks.isError);
   for(const [name,args]of [['solidrpc_create_key',{name:'blocked',idempotencyKey:'fixture-idempotency'}],['solidrpc_manage',{method:'POST',path:'/keys',body:{name:'blocked'}}]]){
    const result=await client.callTool({name,arguments:args});assert.equal(result.isError,true);assert.match(result.content[0].text,/Read-only/);
   }
  }finally{await client.close();}
 }
 assert.equal(f.calls.length,2);
});

test('a malformed rotation reply retains the current credential and never revokes it',async(t)=>{
 const f=await fixture(t);await run(f.env,['login'],{token});
 const result=await run(f.env,['rotate','malformed-fixture']);assert.equal(result.code,1);
 assert.equal(JSON.parse(await readFile(path.join(f.dir,'default.json'),'utf8')).token,token);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'POST');
});

test('half-finished rotation has durable retirement recovery without issuing a second token',async(t)=>{
 for(const retireStatus of [503,401]) {
 const f=await fixture(t,{failRetire:true,retireStatus});await run(f.env,['login'],{token});
 const result=await run(f.env,['rotate']);assert.equal(result.code,2);
 const data=JSON.parse(result.out);assert.equal(data.replacementSaved,true);assert.equal(data.oldRevoked,false);
 assert.equal(data.bootstrap,false);assert.deepEqual(data.scopes,['keys:read']);assert.match(data.retry,/retire-previous/);
 assert.ok(!result.out.includes(token)&&!result.out.includes(replacement));
 const repeat=await run(f.env,['rotate']);assert.equal(repeat.code,1);assert.match(repeat.err,/already saved/);
 const retired=await run(f.env,['retire-previous']);assert.equal(retired.code,0);assert.equal(JSON.parse(retired.out).oldRevoked,true);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/rotate')).length,1);
 assert.equal(JSON.parse(await readFile(path.join(f.dir,'default.json'),'utf8')).pendingRevocation,undefined);
 }
});
test('help needs no credentials, invalid profiles use JSON errors, and read-only provisioning creates no file',async(t)=>{
 const f=await fixture(t);
 assert.equal((await run({...f.env,SOLIDRPC_TOKEN_FILE:'/missing/fixture'},['--help'])).code,0);
 const bad=await run({...f.env,SOLIDRPC_PROFILE:'../bad'},['request']);assert.equal(bad.code,1);assert.equal(JSON.parse(bad.err).error,'Invalid profile name');
 const denied=await run({...f.env,SOLIDRPC_READ_ONLY:'1'},['provision'],{email:'owner@example.com',acceptTerms:true,termsRevision:'fixture'});
 assert.equal(denied.code,1);assert.equal(f.calls.length,0);await assert.rejects(readFile(path.join(f.dir,'default.json')),{code:'ENOENT'});
});
test('shared config directories are not chmodded and public-readable token files are rejected',async(t)=>{
 const f=await fixture(t);await chmod(f.dir,0o755);
 const login=await run(f.env,['login'],{token});assert.equal(login.code,1);assert.equal((await stat(f.dir)).mode&0o777,0o755);
 const file=path.join(f.dir,'external.key');await writeFile(file,token,{mode:0o644});
 const read=await run({...f.env,SOLIDRPC_TOKEN_FILE:file},['request','GET','/me']);assert.equal(read.code,1);assert.equal(f.calls.length,0);
});
test('generic MCP cannot rotate or revoke credentials, including path variants',async(t)=>{
 const f=await fixture(t);const client=new Client({name:'boundary-check',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'mcp'],env:{...f.env,SOLIDRPC_TOKEN:token},stderr:'pipe'}));
 try{
  const tool=(await client.listTools()).tools.find(t=>t.name==='solidrpc_manage');assert.equal(tool.annotations.destructiveHint,true);
  for(const p of ['/credentials/rotate','/credentials/current','//Credentials//current/?a=1','/./credentials/rotate','/credentials/.']){
   const result=await client.callTool({name:'solidrpc_manage',arguments:{method:'POST',path:p}});assert.equal(result.isError,true);assert.match(result.content[0].text,/unavailable through MCP/);
  }
  const huge=await client.callTool({name:'solidrpc_manage',arguments:{method:'PATCH',path:'/keys/security',body:Object.fromEntries(Array.from({length:5000},(_,i)=>['k'+i,i]))}});
  assert.equal(huge.isError,true);assert.match(huge.content[0].text,/maximum.*4096/);
  assert.equal(f.calls.length,0);
 }finally{await client.close();}
});
