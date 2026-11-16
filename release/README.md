# Release procedure

Use [GitHub Releases](https://github.com/SolidRPC/agent-toolkit/releases/latest) to find the current release and its checksums. Check out its tag to reproduce the archives. Future releases and directory submissions require owner approval.

## Build and review

Use Node.js 22.20 or later, npm, Python 3, Git, and unzip. Validation CI tests the 22.20.0 minimum and the latest Node.js 24 and 26 releases.

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

## Publication, after approval

1. Review the exact source commit, release notes, archive contents, hashes, dependency audit, and passing Node 22, 24, and 26 checks. Merge the approved preparation branch into `main`.
2. Build and qualify the approved commit again. Verify that the rebuilt archives match the reviewed hashes. Check npm for the exact version before publishing or retrying.
3. Use the approved GitHub Actions workflow below. If trusted publishing fails and npm still has no matching version, obtain owner approval for a maintainer publish of the same tarball. Confirm `npm whoami` identifies the approved maintainer and check package access in npm. npm may require interactive two-factor verification. Do not create an automation token for this step.

```sh
npm publish "./dist/solidrpc-agent-${APPROVED_VERSION:?Set the approved release version}.tgz" --access public --ignore-scripts
```

4. Compare the published `dist.integrity` with `dist/npm-pack.json`. Install the exact published version of `@solidrpc/agent` into a clean directory and verify CLI help, MCP discovery, and the installed skill.
5. Before publishing a GitHub release, check whether Glama Auto-Release is enabled. If it is enabled, coordinate the approved Glama build first so the new version points to the release commit. Glama configuration and publication require separate approval.
6. Create the version tag at the approved source commit and publish the GitHub release with the matching release notes, three reviewed downloads, and `SHA256SUMS`. Record the tag commit and artifact hashes together.
7. Publish the approved `server.json` to the MCP Registry and verify the public entry. Check that Glama associates the same release version with the tested build and lists the expected tools.

Versions 0.1.0 and 0.1.1 were published through a maintainer login and have no GitHub build provenance. Check npm's attestation metadata before making a provenance claim.

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

The GitHub `npm-production` environment is restricted to `main`. The workflow checks that DamianFigiel remains a required reviewer. The 0.1.1 trusted publish reached npm but received HTTP 404. Maintainer publication succeeded with the approved tarball. End-to-end trusted publishing remains unverified.

The workflow runs only through manual dispatch from `main`, with the exact package version and `publish-approved-release` confirmation. It refuses a private repository. It validates, audits, builds, and qualifies before publishing with OIDC. No npm token is stored in GitHub. Creating or pushing a tag does not publish anything.

The workflows pin npm 11.21.0 and use Node 24 for publishing. Check the trusted publisher settings in npm before dispatching the next approved release.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [publishing scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).
