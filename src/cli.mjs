#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { SolidRPC } from './client.mjs';
import { managementServer } from './mcp.mjs';
import { readPrivate, savePrivate } from './storage.mjs';
import { CLIENT_VERSION } from './version.mjs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const args = process.argv.slice(2);
async function stdin() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 65536) throw new Error('Input too large');
  }
  return JSON.parse(raw || '{}');
}
const usage = [
  'provision: stdin {email,termsRevision,acceptTerms:true}. Saves bootstrap before creating account',
  'login: stdin {token}. Stores a delegated token privately',
  'rotate [name]: saves replacement and a retirement journal before revoking old credential',
  'retire-previous: retries only retirement of a previously saved old credential',
  'request GET /onboarding',
  'request POST /keys: stdin {body:{name},idempotencyKey}. May return a secret, redirect output privately',
  'mcp: stdio MCP server',
];
try {
  let output;
  if (!args.length || ['--help','-h','help'].includes(args[0])) output = {usage, version: CLIENT_VERSION};
  else if (['--version','-v'].includes(args[0])) output = {version: CLIENT_VERSION};
  else {
    const profile = process.env.SOLIDRPC_PROFILE || 'default';
    if (!/^[a-z0-9_-]{1,64}$/i.test(profile)) throw new Error('Invalid profile name');
    const directory = process.env.SOLIDRPC_CONFIG_DIR || path.join(os.homedir(), '.config', 'solidrpc');
    const file = path.join(directory, `${profile}.json`);
    const save = data => savePrivate(file, data);
    let config = {};
    try { config = JSON.parse(await readPrivate(file)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (process.env.SOLIDRPC_TOKEN_FILE && process.env.SOLIDRPC_TOKEN) throw new Error('Choose one external token source');
    const externalToken = process.env.SOLIDRPC_TOKEN_FILE
      ? (await readPrivate(process.env.SOLIDRPC_TOKEN_FILE)).trim() : process.env.SOLIDRPC_TOKEN;
    const client = new SolidRPC({url:process.env.SOLIDRPC_URL || config.url, token:externalToken || config.token,
      readOnly:process.env.SOLIDRPC_READ_ONLY === '1'});
    if (config.token && config.url && config.url !== client.url) throw new Error('Use a separate profile for a different API origin');
    const retire = async () => {
      if (!config.pendingRevocation) throw new Error('No previous credential is pending retirement');
      const old = new SolidRPC({url:client.url,token:config.pendingRevocation.token,readOnly:client.readOnly});
      const result = {rotated:true,replacementSaved:true,oldRevoked:false,credentialId:config.credentialId,
        scopes:config.scopes,bootstrap:config.bootstrap,profile};
      try { await old.request('DELETE','/credentials/current'); }
      catch(e) {
        if(e.status !== 401 || e.code !== 'invalid_credential') {
          process.exitCode = 2;
          return {...result,retry:'Run solidrpc retire-previous. Do not rotate again.',code:e.code,status:e.status};
        }
      }
      delete config.pendingRevocation;
      await save(config);
      return {...result,oldRevoked:true};
    };
    if (args[0] === 'provision') {
      if (client.readOnly) throw new Error('Read-only mode blocks provisioning before creating local credentials');
      if (externalToken) throw new Error('Use an empty profile without an external token to provision an account');
      const input = await stdin();
      if (input.acceptTerms !== true || !input.termsRevision || !input.email) throw new Error('Provide email, termsRevision and acceptTerms:true after owner approval');
      if (config.token && !config.email) throw new Error('Use a new profile to provision an account');
      if (config.email && config.email !== input.email) throw new Error('Use a separate named profile for another account');
      config = {...config,email:input.email,url:client.url,token:config.token || `sa_${crypto.randomBytes(32).toString('hex')}`};
      await save(config);
      const created = await client.provision(input.email,config.token,input.termsRevision);
      output = {accountId:created.accountId,status:created.status,profile};
    } else if (args[0] === 'login') {
      const input = await stdin();
      if (!/^sa_[a-f0-9]{64}$/.test(input.token)) throw new Error('Invalid management token');
      if (config.pendingRevocation) throw new Error('Retire the previous credential before replacing this profile');
      await save({...config,url:client.url,token:input.token}); output = {saved:true,profile};
    } else if (args[0] === 'rotate' || args[0] === 'retire-previous') {
      if (externalToken) throw new Error('External token source detected. Rotate through an explicit management API request outside MCP, save the replacement privately, then retire the old token. Automatic rotation only supports managed profiles.');
      if (client.readOnly) throw new Error('Read-only mode blocks credential changes');
      if (args[0] === 'rotate') {
        if(config.pendingRevocation) throw new Error('Replacement already saved. Run solidrpc retire-previous instead of rotating again.');
        if(!client.token) throw new Error('No management token configured');
        const rotated = await client.rotate(args[1] || 'Agent');
        if(!/^sa_[a-f0-9]{64}$/.test(rotated?.token || '')) throw new Error('Rotation did not return a valid credential. Old credential was retained.');
        config = {...config,url:client.url,token:rotated.token,credentialId:rotated.id,scopes:rotated.scopes,
          bootstrap:rotated.bootstrap,pendingRevocation:{token:client.token}};
        await save(config);
      }
      output = await retire();
    } else if (args[0] === 'mcp') await managementServer(client).connect(new StdioServerTransport());
    else if (args[0] === 'request') {
      const method = args[1] || 'GET';
      if (!['GET','POST','PATCH','DELETE'].includes(method)) throw new Error('Invalid HTTP method');
      const input = method === 'GET' ? {} : await stdin();
      output = await client.request(method,args[2] || '/me',input.body,{idempotencyKey:input.idempotencyKey,paymentSignature:input.paymentSignature});
    } else throw new Error('Unknown command. Use solidrpc --help');
  }
  if (output !== undefined) process.stdout.write(JSON.stringify(output)+'\n');
} catch(e) {
  process.stderr.write(JSON.stringify({error:e.message,code:e.code,status:e.status})+'\n');
  process.exitCode = 1;
}
