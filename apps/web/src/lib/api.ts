const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

type FetchOptions = RequestInit & {
  token?: string;
};

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    ...rest,
  });

  if (!res.ok) {
    // On 401, clear token and redirect to login
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("mfm_admin_token");
      window.location.href = "/login";
      throw new Error("Session expired. Redirecting to login...");
    }

    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `API error ${res.status}`);
  }

  return res.json();
}
