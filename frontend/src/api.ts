const API_BASE = (() => {
  if (import.meta.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const origin = window.location.origin;
  if (origin.includes("8080")) return `${origin}/api`;
  return "http://localhost:8000/api";
})();

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res;
}

export { API_BASE };
