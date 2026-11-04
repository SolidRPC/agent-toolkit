import { rpcClient, checkChain } from './rpc-client.mjs';
const rpc = rpcClient();
for (const [name, chain] of [['Ethereum', 1], ['Base', 8453], ['Arbitrum One', 42161]]) {
  await checkChain(rpc, chain);
  const block = BigInt(await rpc(chain, 'eth_blockNumber')).toString();
  console.log(JSON.stringify({ name, chainId: chain, block }));
}
