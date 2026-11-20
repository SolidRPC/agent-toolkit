# RPC examples

## Free wallet-only quote

From a fresh checkout, run this with Node.js 22.20.0 or later. It needs no wallet, credentials or package installation.

```sh
node examples/base-block-quote.mjs
```

The script reads `payPerRequest.rpc` from [live onboarding](https://api.solidrpc.io/agent/v1/onboarding) and sends one unsigned `eth_getBlockByNumber("latest", false)` request for Base. It stops at HTTP 402. Read the scheme, payment network and amount from `accepts[0]`, and the expiry from `quote.expiresAt`. The expected fee today is 4 millionths of USDC (0.000004 USDC). The script prints the actual quote.

To buy the result, follow onboarding’s `payPerRequest.capabilities`, `payPerRequest.openapi` and [buyer guide](https://rpc.solidrpc.io/x402/batch/guide.md) for x402 batch settlement, including funding, signing and recovery. Get approval for the fee, any reusable USDC deposit and ETH gas before moving funds.

## Account RPC reads

These examples make billable reads with an account RPC key. Use only within the owner's approved usage budget. Keep the `ak_` key in a secret manager or private environment file outside the repository.

Set `RPC_ORIGIN=https://rpc.solidrpc.io` and `RPC_KEY_FILE` to your private RPC key file. Read each script's additional required variables before running:

```sh
node examples/base-balances.mjs
node examples/ethereum-usdc-transfers.mjs
node examples/multichain-check.mjs
```

See the matching guides for inputs and limitations:

- https://solidrpc.io/agents/examples/base-balances
- https://solidrpc.io/agents/examples/ethereum-usdc-transfers
- https://solidrpc.io/agents/examples/multichain

`rpc-client.mjs` is the shared account RPC request helper. Do not use `sa_` management tokens in these scripts.
