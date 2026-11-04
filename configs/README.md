# MCP configuration

Replace the absolute path placeholders with your local checkout and private token file. Run `npm ci --ignore-scripts` in that checkout first. Use a management `sa_` token, never an RPC `ak_` key.

- Codex: merge `codex.toml` into the MCP section of your local config. The alternative `codex-remote.toml` connects directly and reads the token from the process environment.
- Claude Desktop: merge `stdio.json` into your local MCP configuration. Restart the client after editing.
- Claude Code: use `claude mcp add --transport stdio solidrpc --env SOLIDRPC_TOKEN_FILE=/absolute/private/solidrpc-management.key -- node /absolute/path/to/agent-toolkit/src/cli.mjs mcp`.
- Cursor: merge `stdio.json` into `.cursor/mcp.json` or the user MCP configuration. A project file should contain only paths, never token contents.

After connecting, list tools and call `solidrpc_networks`. A fresh session should reconnect with the saved credential. If access was revoked, obtain a new delegation from the owner.

Add `SOLIDRPC_READ_ONLY=1` to the local server environment when only reads are needed. Do not enable automatic approval of mutation tools merely to install this integration.

Remote clients must support custom Bearer headers. SolidRPC's current hosted MCP does not provide OAuth. Clients that require OAuth should use the local process instead. Template availability is not proof of a completed end-to-end run in every client.
