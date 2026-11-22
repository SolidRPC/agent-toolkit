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

const advertisedAsset = '0x' + 'aB'.repeat(20);
const futureExpiry = '2099-01-01T00:03:00.000Z';

async function runQuoteExample(t, {
  asset = advertisedAsset.toLowerCase(),
  network = 'eip155:84532',
  expiresAt = futureExpiry,
  priceUnit = '0.000001 USDC',
} = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'solidrpc-quote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'base-block-quote.mjs');
  await copyFile(new URL('../examples/base-block-quote.mjs', import.meta.url), script);

  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/agent/v1/onboarding') {
      res.end(JSON.stringify({ payPerRequest: {
        scheme: 'batch-settlement', rpc: origin + '/fixture/evm/{chainId}', capabilities: origin + '/fixture/capabilities',
      } }));
    } else if (req.url === '/fixture/capabilities') {
      res.end(JSON.stringify({ asset: advertisedAsset, paymentNetwork: 'eip155:84532', priceUnit }));
    } else {
      res.writeHead(402);
      res.end(JSON.stringify({ accepts: [{ scheme: 'batch-settlement', asset, network, amount: '1000007' }], quote: { expiresAt } }));
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

  return { calls, stdout };
}

test('standalone Base example discovers a route and stops at its unsigned quote', async t => {
  const { calls, stdout } = await runQuoteExample(t);
  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ['GET', '/agent/v1/onboarding'], ['GET', '/fixture/capabilities'], ['POST', '/fixture/evm/8453'],
  ]);
  const request = calls[2];
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['payment-signature'], undefined);
  assert.equal(request.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(request.body), { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] });
  assert.deepEqual(JSON.parse(stdout), {
    httpStatus: 402, scheme: 'batch-settlement', paymentNetwork: 'eip155:84532',
    expiresAt: futureExpiry, amountMillionths: '1000007', priceUSDC: '1.000007',
  });
});

for (const [scenario, overrides, message] of [
  ['a different asset', { asset: '0x' + 'cd'.repeat(20) }, 'Quote asset does not match live capabilities'],
  ['a different payment network', { network: 'eip155:1' }, 'Quote payment network does not match live capabilities'],
  ['an expired quote', { expiresAt: '2000-01-01T00:00:00Z' }, 'Quote has expired'],
  ['a different price unit', { priceUnit: '0.01 USDC' }, 'Expected capabilities to price calls in millionths of USDC'],
]) {
  test(`rejects ${scenario} without printing a price`, async t => {
    await assert.rejects(runQuoteExample(t, overrides), error => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes(message), error.stderr);
      assert.equal(error.stdout, '');
      return true;
    });
  });
}
