import { cookies } from "next/headers";

const cookieName = "tumaride_session";
const apiBase = (process.env.TUMARIDE_API_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

export async function authBackend(path: "challenge" | "verify" | "me", init?: RequestInit) {
  return backendRequest(`auth/${path}`, init);
}

export function backendRequest(path: string, init?: RequestInit) {
  return fetch(`${apiBase}/${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
}

export async function getAuthToken() {
  return (await cookies()).get(cookieName)?.value;
}

export async function setAuthToken(token: string) {
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearAuthToken() {
  (await cookies()).delete(cookieName);
}

export function authError(message: string, status: number) {
  return Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function authResponse(data: object) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
