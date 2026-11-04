// Node.js 22+. Read-only requests, bounded retries, no credentials in output.
import { readFileSync } from 'node:fs';
export function rpcClient(origin = process.env.RPC_ORIGIN) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('RPC_ORIGIN must be an HTTPS origin without credentials or a path');
  const key = readFileSync(process.env.RPC_KEY_FILE, 'utf8').trim();
  if (!key.startsWith('ak_')) throw Error('RPC_KEY_FILE must contain an ak_ RPC key, not an sa_ management credential');
  return async function rpc(chainId, method, params = []) {
    if (!['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_call', 'eth_getLogs'].includes(method)) throw Error('This example permits read-only methods only');
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try {
        response = await fetch(`${url.origin}/evm/${chainId}`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        });
      } catch { throw Error(`Transport failed for ${method}. No automatic restart or payment was attempted.`); }
      if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
        const retry = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 30000) : 1000 * 2 ** attempt;
        await response.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) throw Object.assign(Error(`RPC HTTP ${response.status} for ${method}. Check account, quota, and permissions.`), { status: response.status });
      let body;
      try { body = await response.json(); } catch { throw Error('RPC did not return JSON'); }
      if (body.error) throw Object.assign(Error(`JSON-RPC error ${body.error.code} for ${method}`), { rpcError: true, code: body.error.code });
      if (!Object.hasOwn(body, 'result')) throw Error('Missing JSON-RPC result');
      return body.result;
    }
  };
}
export function integer(name, fallback, min, max) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}
export async function checkChain(rpc, chain) {
  if (BigInt(await rpc(chain, 'eth_chainId')) !== BigInt(chain)) throw Error(`Unexpected chain ID for ${chain}`);
}
export function decimal(raw, places) {
  const value = BigInt(raw).toString().padStart(places + 1, '0');
  return `${value.slice(0, -places)}.${value.slice(-places)}`;
}
