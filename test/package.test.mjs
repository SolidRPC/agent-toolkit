import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CLIENT_VERSION } from '../src/version.mjs';
test('package exports and version are consistent',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 assert.equal(pkg.version,CLIENT_VERSION);assert.equal(pkg.exports['./mcp'],'./src/mcp.mjs');assert.equal(pkg.private,true);
});
test('public scan includes tests and scripts',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'public-scan-'));
 try{
  await mkdir(path.join(dir,'scripts'));await mkdir(path.join(dir,'test'));
  await copyFile(new URL('../scripts/check-public.mjs',import.meta.url),path.join(dir,'scripts/check-public.mjs'));
  assert.equal(spawnSync(process.execPath,[path.join(dir,'scripts/check-public.mjs')]).status,0);
  for(const target of ['test/leak.txt','scripts/leak.txt']){
   await writeFile(path.join(dir,target),'sa_'+'a'.repeat(64));
   assert.notEqual(spawnSync(process.execPath,[path.join(dir,'scripts/check-public.mjs')]).status,0);
   await rm(path.join(dir,target));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
