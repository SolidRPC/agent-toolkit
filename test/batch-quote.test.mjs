import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const onboarding = 'https://api.solidrpc.io/agent/v1/onboarding';

test('installable skill directs wallet-only RPC to live batch settlement', async () => {
  const skill = await readFile(new URL('../skills/solidrpc/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /^description: .*wallet.*x402 batch settlement/m);
  assert.ok(skill.includes(onboarding));
  for (const field of ['buyerGuide', 'capabilities', 'openapi']) {
    assert.ok(skill.includes(`payPerRequest.${field}`));
  }
});

test('standalone Base example discovers a route and stops at its unsigned quote', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'solidrpc-quote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'base-block-quote.mjs');
  await copyFile(new URL('../examples/base-block-quote.mjs', import.meta.url), script);

  const calls = [];
  const expiresAt = '2099-01-01T00:03:00.000Z';
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/agent/v1/onboarding') {
      res.end(JSON.stringify({ payPerRequest: { scheme: 'batch-settlement', rpc: origin + '/fixture/evm/{chainId}' } }));
    } else {
      res.writeHead(402);
      res.end(JSON.stringify({ accepts: [{ scheme: 'batch-settlement', network: 'eip155:8453', amount: '1000007' }], quote: { expiresAt } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const preload = `
    const fetch = globalThis.fetch;
    globalThis.fetch = (url, options) => {
      if (url === '${onboarding}') url = '${origin}/agent/v1/onboarding';
      if (new URL(url).origin !== '${origin}') throw new Error('Unexpected external request');
      return fetch(url, options);
    };
  `;
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(preload), script,
  ], { cwd: directory, env: {}, timeout: 10000 });

  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ['GET', '/agent/v1/onboarding'], ['POST', '/fixture/evm/8453'],
  ]);
  const request = calls[1];
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['payment-signature'], undefined);
  assert.equal(request.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(request.body), { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] });
  assert.deepEqual(JSON.parse(stdout), {
    httpStatus: 402, scheme: 'batch-settlement', paymentNetwork: 'eip155:8453',
    expiresAt, amountMillionths: '1000007', priceUSDC: '1.000007',
  });
});
