import { cookies } from "next/headers";
import { getPayloadClient } from "./payload";

const COOKIE_NAME = "payload-token";

export interface SessionUser {
  id: string;
  email: string;
}

export async function setSessionCookie(token: string, exp?: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(exp ? { expires: new Date(exp * 1000) } : {}),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await getPayloadClient();
  const { user } = await payload.auth({
    headers: new Headers({ Authorization: `JWT ${token}` }),
  });
  if (!user) return null;

  const record = user as unknown as { id: string | number; email: string };
  return { id: String(record.id), email: record.email };
}

/** Resolves the user that owns this API key, or null if it's invalid/disabled. */
export async function getUserByApiKey(apiKey: string): Promise<SessionUser | null> {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({
    headers: new Headers({ Authorization: `users API-Key ${apiKey}` }),
  });
  if (!user) return null;

  const record = user as unknown as { id: string | number; email: string };
  return { id: String(record.id), email: record.email };
}
