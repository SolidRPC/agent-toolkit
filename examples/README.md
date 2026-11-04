# RPC examples

These are small reference scripts, not production indexers. They make billable RPC reads. Use only within the owner's approved usage budget. Keep the `ak_` key in a secret manager or private environment file outside the repository.

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

`rpc-client.mjs` is the shared request helper. Do not use `sa_` management tokens in these scripts.
