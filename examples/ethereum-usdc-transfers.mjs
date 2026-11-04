import { rpcClient, integer, checkChain, decimal } from './rpc-client.mjs';
const from = integer('FROM_BLOCK', NaN, 0, Number.MAX_SAFE_INTEGER);
const to = integer('TO_BLOCK', NaN, from, Number.MAX_SAFE_INTEGER);
const chunk = integer('CHUNK_BLOCKS', 100, 1, 1000);
const maxRequests = integer('MAX_REQUESTS', 100, 3, 10000);
if (to - from > 100000) throw Error('Limit one run to 100,001 blocks or fewer. Split larger exports into explicit runs.');
const call = rpcClient();
let requests = 0;
async function rpc(...args) {
  if (++requests > maxRequests) throw Error('MAX_REQUESTS reached. Resume from the last completed range.');
  return call(...args);
}
await checkChain(rpc, 1);
const head = Number(BigInt(await rpc(1, 'eth_blockNumber')));
if (to > head) throw Error('TO_BLOCK is above the current head');
const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
async function exportRange(start, end) {
  let logs;
  try {
    logs = await rpc(1, 'eth_getLogs', [{ address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}`, topics: [topic] }]);
  } catch (error) {
    // Split only size-limit errors. Never turn auth, quota, or provider faults into a request storm.
    if (!error.rpcError || ![-32005, -32602].includes(error.code) || start === end) throw error;
    const middle = Math.floor((start + end) / 2);
    await exportRange(start, middle);
    await exportRange(middle + 1, end);
    return;
  }
  if (!Array.isArray(logs)) throw Error('Expected a log array');
  const seen = new Set();
  for (const log of logs) {
    if (log.removed) throw Error('Removed log encountered. Reconcile the affected range before continuing.');
    const identity = `${log.blockHash}:${log.transactionHash}:${log.logIndex}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (log.topics?.length !== 3 || log.topics[0].toLowerCase() !== topic || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) throw Error('Unexpected Transfer log shape');
    console.log(JSON.stringify({ block: BigInt(log.blockNumber).toString(), blockHash: log.blockHash, transactionHash: log.transactionHash, logIndex: log.logIndex, from: `0x${log.topics[1].slice(-40)}`, to: `0x${log.topics[2].slice(-40)}`, usdc: decimal(log.data, 6) }));
  }
  console.error(`Completed blocks ${start}-${end}. Next block: ${end + 1}.`);
}
for (let start = from; start <= to; start += chunk) await exportRange(start, Math.min(start + chunk - 1, to));
