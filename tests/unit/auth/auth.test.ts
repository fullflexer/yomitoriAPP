import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isAuthorizedBasicAuth, middleware } from "../../../src/middleware";

function encodeBasicAuth(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("Basic Auth middleware", () => {
  it("未認証なら 401 と WWW-Authenticate を返す", () => {
    process.env.BASIC_AUTH_USER = "demo";
    process.env.BASIC_AUTH_PASS = "secret";

    const response = middleware(new NextRequest("http://localhost/cases"));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("認証済みなら通過する", () => {
    process.env.BASIC_AUTH_USER = "demo";
    process.env.BASIC_AUTH_PASS = "secret";

    const response = middleware(
      new NextRequest("http://localhost/cases", {
        headers: {
          authorization: encodeBasicAuth("demo", "secret"),
        },
      }),
    );

    expect(isAuthorizedBasicAuth(encodeBasicAuth("demo", "secret"), "demo", "secret")).toBe(
      true,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
  });
});
