# SolidRPC agent toolkit 0.1.3

- The agent skill covers wallet-only RPC through x402 batch settlement, including single calls. It explains how to save the channel configuration before depositing and how to recover a request after a lost response.
- The new Base example gets a free quote for the latest block with transaction hashes. It checks the asset, payment network, price unit and expiry before printing the quoted fee. Run `node examples/base-block-quote.mjs` from the extracted source ZIP with Node.js 22.20.0 or later. The example requires no wallet or credentials.
- The local MCP network and top-up tools now describe their account scope. Existing account management commands and tool inputs are unchanged.

Install the CLI and local MCP server with `npm install --global @solidrpc/agent@0.1.3`. If you installed the skill separately, refresh it in your agent client. Wallet-only RPC needs only HTTP and a wallet. [Live agent onboarding](https://api.solidrpc.io/agent/v1/onboarding)
