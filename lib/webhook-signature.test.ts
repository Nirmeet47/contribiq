import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidSignature } from "./webhook-signature";

function signBody(body: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("isValidSignature", () => {
  it("accepts a correctly signed body with the correct secret", () => {
    const body = JSON.stringify({ action: "opened", repository: { name: "contribiq" } });
    const secret = "webhook-secret";

    expect(isValidSignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it("rejects a tampered body with the original signature", () => {
    const body = JSON.stringify({ action: "opened" });
    const tamperedBody = JSON.stringify({ action: "closed" });
    const secret = "webhook-secret";

    expect(isValidSignature(tamperedBody, signBody(body, secret), secret)).toBe(false);
  });

  it("rejects a signature generated with the wrong secret", () => {
    const body = JSON.stringify({ action: "opened" });

    expect(isValidSignature(body, signBody(body, "wrong-secret"), "correct-secret")).toBe(false);
  });

  it("rejects requests when no secret is configured", () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = signBody(body, "webhook-secret");

    expect(isValidSignature(body, signature, undefined)).toBe(false);
    expect(isValidSignature(body, signature, "")).toBe(false);
  });

  it("rejects requests without a signature header", () => {
    expect(isValidSignature("{}", null, "webhook-secret")).toBe(false);
  });

  it("rejects signatures without the sha256 prefix", () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = signBody(body, "webhook-secret").slice("sha256=".length);

    expect(isValidSignature(body, signature, "webhook-secret")).toBe(false);
  });
});
