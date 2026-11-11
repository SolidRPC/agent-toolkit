# SolidRPC agent toolkit

Let an agent connect your application to blockchain RPC within your approved budget. SolidRPC handles routing, failover, monitoring, and recovery behind one RPC integration.

This repository contains a Node.js management client, a local MCP server, an agent skill, and runnable RPC examples. The hosted MCP endpoint is also available at `https://api.solidrpc.io/agent/mcp`.

## Start here

Read [agent onboarding](https://api.solidrpc.io/agent/v1/onboarding) and the [setup guide](https://solidrpc.io/docs/agents). The live onboarding response supplies availability, payment network, terms, pricing, limits, and recovery steps. Read those values at setup time.

For an existing account, delegate an agent credential from a paid plan or PAYG account. Free accounts cannot delegate agent control. For a new account, obtain the owner's email, account-creation and terms approval, and separate payment and usage ceilings. Account provisioning itself spends nothing. Email verification and a password are not required for agent activation. The owner can claim dashboard access later.

| Credential | Purpose | Destination |
| --- | --- | --- |
| `sa_` management token | Account, keys, usage and billing | `https://api.solidrpc.io/agent/v1` and `/agent/mcp` |
| `ak_` RPC key | Blockchain requests | RPC URL returned by `/networks` |

## Install

Requires Node.js 22.20 or later. In a downloaded checkout of this toolkit:

```sh
npm ci --ignore-scripts
npm test
node src/cli.mjs request GET /onboarding
```

Install the pinned version from npm:

```sh
npm install --global @solidrpc/agent@0.1.1
solidrpc --help
solidrpc request GET /onboarding
```

The CLI and local MCP server are included in this one package. Run `solidrpc mcp` to start the MCP server. Release downloads contain the npm tarball, source ZIP, and desktop MCP bundle. The bundle includes its runtime dependencies and requires Node.js 22.20 or later.

For development, use the source commands above or install a locally built tarball. Published downloads are available in [GitHub Releases](https://github.com/SolidRPC/agent-toolkit/releases). See [the release procedure](https://github.com/SolidRPC/agent-toolkit/blob/main/release/README.md) for review and verification.

## Give your agent access

Save only the `sa_` token in an owner-only file outside your repository. Configure `SOLIDRPC_TOKEN_FILE` with its absolute path. A secret manager can supply `SOLIDRPC_TOKEN` instead. Choose one source.

```sh
export SOLIDRPC_TOKEN_FILE=/absolute/private/solidrpc-management.key
solidrpc request GET /me
solidrpc request GET /networks
solidrpc mcp
```

From a source checkout, replace `solidrpc` with `node src/cli.mjs`.

MCP setup templates for Codex, Claude Code/Desktop, and Cursor are in [configs](configs/README.md). They use the local process and a token file. The server reads that one file and sends the token to the SolidRPC management API by default. An explicit `SOLIDRPC_URL` override can send it to a loopback development server. Never use a real credential for loopback tests. Redirects are rejected.

Set `SOLIDRPC_READ_ONLY=1` for a locally enforced read-only session. The server still advertises its full tool catalog, but blocks every mutation, credential operation and RPC-key secret read before a network call. Server-side credential scopes remain the authority for account permissions.

## Account provisioning and recovery

Read the terms URLs and current revision in onboarding. After owner approval, send JSON on stdin:

```sh
node src/cli.mjs provision < /absolute/private/approved-account.json
```

The input contains `email`, `termsRevision`, and `acceptTerms: true`. The CLI saves the bootstrap secret before the network request. Repeat the same input and profile after a lost response. Use `SOLIDRPC_PROFILE` for separate accounts.

Follow the live onboarding steps to sign the approved budget and fund the account. The [published payment example](https://api.solidrpc.io/agent/v1/example) explains the external wallet flow. This toolkit does not hold wallet keys or automatically pay. Persist idempotency keys and payment proofs privately before submission. For uncertain payments, inspect the existing funding intent and follow its recovery instructions. Never create a second payment to guess whether the first succeeded.

After funding settles, rotate the bootstrap credential to obtain operational scopes. `solidrpc rotate` saves a replacement and a private retirement journal before retiring the old credential. Its output includes scopes and bootstrap status. If retirement fails, it returns `replacementSaved:true` and `oldRevoked:false` with exit code 2. Run `solidrpc retire-previous` to retry retirement without creating another credential. For external token files or secret managers, use explicit management requests and persist the replacement before revoking the old token. If rotation's response is lost, the old token remains usable. Repeated rotation can create orphaned credentials, so inspect and retire those deliberately.

`solidrpc request` emits the API response. Key creation and credential rotation can return secrets. On POSIX shells, use an owner-only directory and create a fresh output file with private permissions. For example, with approved key creation input:

```sh
(umask 077; set -C; solidrpc request POST /keys \
  < /absolute/private/approved-key-request.json \
  > /absolute/private/created-key.json)
```

Use a new output filename for each attempt and reuse the same idempotency key when retrying the same request. On Windows, use an owner-only directory and file ACLs. `sa_` credentials alone cannot approve a wallet budget. Card subscription purchases remain an owner action.

## Tools

The MCP server exposes network discovery, RPC key listing/creation/revocation, usage, billing, top-up quotes, support tickets, and a generic management request tool. A top-up quote does not transfer USDC. Support-ticket creation sends a message, so use it only when the owner requests contact. Clients must retain their own approval controls for writes and payments.

## Examples

Use a separate `ak_` key in a private file selected by `RPC_KEY_FILE`, and set `RPC_ORIGIN=https://rpc.solidrpc.io`. These scripts make billable read calls and require an approved usage budget. Read [examples/README.md](examples/README.md) before running them.

- Base ETH and USDC balances
- Ethereum USDC Transfer export
- Ethereum, Base and Arbitrum connectivity

## Agent skill

The skill is in [skills/solidrpc/SKILL.md](skills/solidrpc/SKILL.md). From a separate project, install this local checkout with the skills CLI:

```sh
npx skills add /absolute/path/to/agent-toolkit --skill solidrpc -a codex claude-code cursor
```

For Cursor, if the shared skill is not listed, copy the same `SKILL.md` into `.cursor/skills/solidrpc/SKILL.md` in your project and start a fresh session. Codex uses `.agents/skills/solidrpc/SKILL.md`, and Claude Code uses `.claude/skills/solidrpc/SKILL.md`.

Install the skill directly from this public repository:

```sh
npx skills add SolidRPC/agent-toolkit --skill solidrpc -a codex claude-code cursor
```

The same skill is included in the npm package and release downloads. Installing a skill makes it available in that client. It does not make every agent discover or prefer SolidRPC.

## Development

Run `npm test` and `npm run check:public`. Never add credentials, local profiles, wallet keys, private infrastructure configuration, or unpublished operational records to this repository. The public package is an extraction of the existing SolidRPC client, with local safety and packaging adaptations.

Credential operations are deliberately unavailable through the generic MCP tool. Use the CLI or an explicit API workflow that saves replacement credentials before retiring old ones. Read-only mode also blocks secret retrieval. Creating an RPC key in normal MCP mode still returns the new key through the tool result, so that client's transcript can contain it. Use a CLI request redirected to a private file when the key must stay out of model transcripts.

Configuration storage must be a dedicated private directory. The CLI rejects shared directories instead of changing their permissions. On POSIX systems it also rejects token files accessible to other users or owned by someone else. On Windows, configure owner-only ACLs yourself. Help and version commands do not load credentials.
