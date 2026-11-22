import { describe, expect, it } from "vitest";
import { checkSameOrigin, rateLimit } from "./guard";

const req = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:3050/api/generate", { method: "POST", headers });

describe("checkSameOrigin", () => {
  it("accepts the app's own JSON requests", () => {
    expect(checkSameOrigin(req({ "content-type": "application/json", host: "127.0.0.1:3050" })).ok).toBe(true);
    expect(
      checkSameOrigin(
        req({ "content-type": "application/json", host: "127.0.0.1:3050", origin: "http://127.0.0.1:3050", "sec-fetch-site": "same-origin" }),
      ).ok,
    ).toBe(true);
  });

  it("rejects cross-site and non-JSON requests", () => {
    expect(checkSameOrigin(req({ "content-type": "text/plain", host: "127.0.0.1:3050" })).ok).toBe(false);
    expect(checkSameOrigin(req({ "content-type": "application/json", host: "127.0.0.1:3050", origin: "https://evil.example" })).ok).toBe(false);
    expect(checkSameOrigin(req({ "content-type": "application/json", host: "127.0.0.1:3050", "sec-fetch-site": "cross-site" })).ok).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit, then asks to wait", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(0);
    expect(rateLimit(key, 3, 60_000)).toBeGreaterThan(0);
  });
});
