import { CLIENT_VERSION } from './version.mjs';
export function managementPath(path) { return new URL(path.replace(/\/+/g, '/'), 'https://local.invalid').pathname.replace(/\/$/, '').toLowerCase(); }
export class SolidRPC {
  constructor({
    url = "https://api.solidrpc.io",
    token,
    readOnly = false,
    fetch: transport = globalThis.fetch,
  } = {}) {
    const origin = new URL(url);
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      )
    )
      throw new Error("Use HTTPS or a local test server");
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/")
      throw new Error("Invalid API origin");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.origin !== "https://api.solidrpc.io" && !local)
      throw new Error("Only the SolidRPC API and loopback test servers are supported");
    if (token && !/^sa_[a-f0-9]{64}$/.test(token))
      throw new Error("Use an sa_ management token. ak_ keys belong to the RPC endpoint.");
    this.readOnly = readOnly;
    this.url = origin.origin;
    this.token = token;
    this.fetch = transport;
  }
  async request(method, path, body, { idempotencyKey, paymentSignature } = {}) {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) throw new Error("Invalid HTTP method");
    const route = managementPath(path);
    if (this.readOnly && (method !== "GET" || /^\/credentials(?:\/|$)/.test(route) || /^\/keys\/[^/]+\/secret$/.test(route)))
      throw new Error("Read-only mode blocks changes, credential operations and secret disclosure");
    if (
      !/^\/[a-z0-9/_.-]*(?:\?[^#]*)?$/i.test(path) ||
      path.includes("..") ||
      path.startsWith("//")
    )
      throw new Error("Invalid management path");
    const headers = { "Content-Type": "application/json", "User-Agent": `solidrpc-agent/${CLIENT_VERSION}` };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (paymentSignature) headers["PAYMENT-SIGNATURE"] = paymentSignature;
    const response = await this.fetch(`${this.url}/agent/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    let data;
    try { data = await response.json(); }
    catch { const error = new Error(`HTTP ${response.status}: expected a JSON response`); error.status = response.status; throw error; }
    if (!response.ok) {
      const e = new Error(
        (typeof data?.error === "string" && data.error) || (typeof data?.message === "string" && data.message) || `HTTP ${response.status}`,
      );
      e.status = response.status;
      e.code = data?.code;
      e.details = data?.details;
      e.response = data;
      throw e;
    }
    return data;
  }
  provision(email, bootstrapSecret, termsRevision) {
    if (!email || !termsRevision) throw new Error("Provide owner email and explicitly accepted termsRevision");
    return this.request("POST", "/accounts", {
      email,
      bootstrapSecret,
      termsRevision,
    });
  }
  networks() {
    return this.request("GET", "/networks");
  }
  billing() {
    return this.request("GET", "/billing");
  }
  keys() {
    return this.request("GET", "/keys");
  }
  createKey(name, idempotencyKey) {
    return this.request("POST", "/keys", { name }, { idempotencyKey });
  }
  revokeKey(id) {
    return this.request("DELETE", `/keys/${encodeURIComponent(id)}`);
  }
  rotate(name) {
    return this.request("POST", "/credentials/rotate", { name });
  }
}
