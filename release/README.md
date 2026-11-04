# Release preparation

The repository is private and version 0.1.0 is not published. These instructions do not authorize publication. Obtain owner approval before making the repository public, publishing npm packages or GitHub releases, or submitting directory listings.

## Build and review

Use Node.js 22.20 or later, npm, Python 3, Git, and unzip.

```sh
npm ci --ignore-scripts
npm test
npm run check:public
npm audit --audit-level=low
npm run release:build
npm run release:check
```

The source manifest retains `private: true`. The builder removes only this field in an isolated release copy. The npm tarball and MCP bundle use that release manifest. The source ZIP preserves the private source manifest so its tests and build procedure remain usable. The original checkout is unchanged. The source ZIP includes tracked and nonignored source files, so inspect `git status` before building. Generated archives and local credentials are excluded from Git.

`dist/` contains the source ZIP, npm tarball, desktop MCP bundle, SHA-256 checksums, npm integrity metadata, and qualification results. The ZIP files use fixed timestamps, ordering, and modes. The npm tarball keeps npm's tar contents and uses a deterministic uncompressed gzip wrapper to avoid Node compression-library differences. Its SHA-1 and SHA-512 integrity metadata are recalculated from those exact bytes. The MCP bundle is an unsigned ZIP using manifest version 0.3. It includes only lockfile-installed runtime dependencies. Rebuilding the same source with the same npm version should reproduce all three hashes.

Qualification installs the actual npm tarball in an isolated temporary directory and starts the installed and bundled MCP servers. It verifies tool discovery, a mocked network read, and mutation rejection in read-only mode. It does not create accounts, pay, or call customer accounts. It does not prove desktop UI installation or public registry installation.

## First publication, after approval

1. Review the exact source commit, release notes, archive contents, hashes, dependency audit, and passing Node 22 and 24 checks. Merge the approved preparation branch into `main`.
2. Make `SolidRPC/agent-toolkit` public only after approval. This repository has independent history and contains only the toolkit.
3. Build and qualify the approved commit again. Confirm `npm whoami` is the approved maintainer and `npm org ls solidrpc` shows permission. Check `npm view @solidrpc/agent` before publishing. A registry 404 means no visible package exists, not a reservation guarantee.
4. Publish the exact inspected tarball using the maintainer's local npm login. npm may require interactive two-factor verification. Do not create an automation token for this step.

```sh
npm publish ./dist/solidrpc-agent-0.1.0.tgz --access public --ignore-scripts
```

5. Compare the published `dist.integrity` with `dist/npm-pack.json`. Install `@solidrpc/agent@0.1.0` from npm into a clean directory and verify CLI help, MCP discovery, and the installed skill. Do not imply that local archive testing already proves this.
6. Create tag `v0.1.0` at the approved source commit and a GitHub release using `release/NOTES-0.1.0.md`. Attach the three reviewed downloads and `SHA256SUMS`. Upload no credentials or internal review records. Record the tag commit and artifact hashes together.
7. Install the skill from the public repository in fresh Codex, Claude Code, and Cursor sessions. Directory submissions remain a separate approval.

The first local publication has no GitHub build provenance. Later trusted publications include provenance when the repository and package are public. Do not describe the initial release as provenance-attested.

## Future releases through GitHub Actions

After the npm package exists, open its npm settings and configure Trusted Publishing:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `SolidRPC` |
| Repository | `agent-toolkit` |
| Workflow filename | `publish.yml` |
| Environment | `npm-production` |
| Allowed operation | Direct publishing |

Configure the GitHub `npm-production` environment with a required owner reviewer and deployment restricted to `main` before the first workflow run. GitHub rejected reviewer protection while this repository was private on its current plan. Configure it after the approved visibility change, or keep publication manual until an equivalent approval control is agreed. The workflow also reads the environment rules and refuses publication unless DamianFigiel is a required reviewer.

The workflow runs only through manual dispatch from `main`, with the exact package version and `publish-approved-release` confirmation. It refuses a private repository. It validates, audits, builds, and qualifies before publishing with OIDC. No npm token is stored in GitHub. Creating or pushing a tag does not publish anything.

The workflows pin npm 11.21.0 and use Node 24 for publishing. OIDC requires npm 11.5.1 or newer. Trusted publisher configuration cannot be verified by `npm whoami`. Its end-to-end verification is the first approved workflow publication.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [publishing scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).
