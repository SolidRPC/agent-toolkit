# SolidRPC agent toolkit 0.1.0

One RPC integration. No provider stack to manage.

This first release includes:

- The `solidrpc` CLI for account setup, keys, networks, usage, and billing.
- A local MCP server in the same npm package, started with `solidrpc mcp`.
- Setup instructions for Codex, Claude Code, Claude Desktop, and Cursor.
- An installable SolidRPC skill and three RPC examples.
- A desktop MCP bundle with its runtime dependencies included.

Requires Node.js 22.20 or later.

```sh
npm install --global @solidrpc/agent@0.1.0
solidrpc --help
```

Read [the agent setup guide](https://solidrpc.io/docs/agents) before connecting an account. Use an `sa_` token for management and an `ak_` key for RPC requests. Free accounts cannot delegate agent control. An agent can create a prepaid account after owner approval, or use delegated access to an existing paid plan or PAYG account.

The toolkit does not hold wallet private keys or pay automatically. Account creation, terms acceptance, and spending require the owner's approval.

The downloads include `solidrpc-agent-0.1.0.tgz`, `solidrpc-0.1.0.mcpb`, `agent-toolkit-0.1.0-source.zip`, and `SHA256SUMS`. The npm tarball and MCP bundle contain the same client source. The source ZIP includes tests and release tooling.
