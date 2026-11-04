import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const pkg=JSON.parse(await readFile(path.join(root,'package.json')));
const output=path.join(root,'dist');
const records=JSON.parse(await readFile(path.join(output,'artifact-hashes.json')));
assert.equal(records.length,3);
for(const item of records){
 const data=await readFile(path.join(output,item.file));
 assert.equal(data.length,item.bytes);
 assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
}
const temp=await mkdtemp(path.join(tmpdir(),'solidrpc-release-check-'));
const server=http.createServer((req,res)=>{
 assert.equal(req.method,'GET');
 assert.equal(req.url,'/agent/v1/networks');
 res.setHeader('content-type','application/json');
 res.end(JSON.stringify({networks:[{chainId:1}]}));
});
server.listen(0,'127.0.0.1');await once(server,'listening');
try{
 const npmArchive=path.join(output,`solidrpc-agent-${pkg.version}.tgz`);
 execFileSync('npm',['install','--prefix',path.join(temp,'install'),'--ignore-scripts','--no-audit','--no-fund',npmArchive],{stdio:'pipe'});
 const installed=path.join(temp,'install/node_modules/@solidrpc/agent');
 const manifest=JSON.parse(await readFile(path.join(installed,'package.json')));
 assert.equal(manifest.private,undefined);
 assert.equal(manifest.version,pkg.version);
 for(const exported of Object.values(manifest.exports))await readFile(path.join(installed,exported));
 execFileSync(process.execPath,[path.join(installed,'src/cli.mjs'),'--help'],{env:{PATH:process.env.PATH,SOLIDRPC_TOKEN_FILE:'/missing/fixture'},stdio:'pipe'});
 const bundle=path.join(temp,'bundle');
 execFileSync('unzip',['-q',path.join(output,`solidrpc-${pkg.version}.mcpb`),'-d',bundle]);
 const bundled=JSON.parse(await readFile(path.join(bundle,'manifest.json')));
 assert.equal(bundled.version,pkg.version);
 assert.equal(bundled.server.entry_point,'src/cli.mjs');
 const results=[];
 for(const location of [installed,bundle]){
  const client=new Client({name:'release-check',version:'1.0.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(location,'src/cli.mjs'),'mcp'],env:{PATH:process.env.PATH,SOLIDRPC_URL:`http://127.0.0.1:${server.address().port}`,SOLIDRPC_CONFIG_DIR:path.join(temp,'profile'),SOLIDRPC_READ_ONLY:'1'},stderr:'pipe'}));
  try{
   const list=await client.listTools();assert.equal(list.tools.length,9);
   assert.ok(!(await client.callTool({name:'solidrpc_networks',arguments:{}})).isError);
   const denied=await client.callTool({name:'solidrpc_manage',arguments:{method:'POST',path:'/keys',body:{name:'denied'}}});
   assert.equal(denied.isError,true);
   results.push({artifact:location===installed?'npm':'mcpb',tools:list.tools.length,networkRead:true,writeBlocked:true});
  }finally{await client.close();}
 }
 const result={node:process.version,results,liveAccountsCreated:0,payments:0,published:false};
 await writeFile(path.join(output,'qualification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await rm(temp,{recursive:true,force:true});
}
