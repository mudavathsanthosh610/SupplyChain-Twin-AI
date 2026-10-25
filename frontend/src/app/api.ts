export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001"
).replace(/\/+$/, "");
export const AUTH_TOKEN_KEY = "supplychain-auth-token";

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    !String(input).includes("/auth/")
  ) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event("supplychain:auth-expired"));
  }
  return response;
}
