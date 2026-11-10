# SolidRPC agent toolkit 0.1.1

- The CLI stops before making a request if the selected management token file is empty or contains only whitespace. This prevents requests from using a different saved account when the selected file has no token.
- The setup guide shows how to capture responses that contain secrets in a new owner-only file.
- Validation now covers Node.js 26 alongside Node.js 22.20.0 and 24. The minimum version is Node.js 22.20.0.
- The MCP Registry entry and the desktop MCP bundle use the SolidRPC icon.

```sh
npm install --global @solidrpc/agent@0.1.1
solidrpc --version
```

See the [agent setup guide](https://solidrpc.io/docs/agents) for token and MCP configuration. The release downloads include the npm tarball, desktop MCP bundle, source ZIP, and SHA-256 checksums.
