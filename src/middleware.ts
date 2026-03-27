import { NextResponse, type NextRequest } from "next/server";

const REALM = 'Basic realm="yomitoriAPP"';

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": REALM,
    },
  });
}

export function isAuthorizedBasicAuth(header: string | null, expectedUser: string, expectedPass: string) {
  if (!header?.startsWith("Basic ")) {
    return false;
  }

  const encoded = header.slice("Basic ".length).trim();

  try {
    const decoded =
      typeof atob === "function"
        ? atob(encoded)
        : Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return false;
    }

    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    return user === expectedUser && pass === expectedPass;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const authorized = isAuthorizedBasicAuth(
    request.headers.get("authorization"),
    expectedUser,
    expectedPass,
  );

  if (!authorized) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
