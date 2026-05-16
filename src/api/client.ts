import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

const baseURL = import.meta.env.VITE_API_BASE ?? "/";

export const http: AxiosInstance = axios.create({
  baseURL,
  // Sane defaults; per-call overrides are still possible.
  timeout: 60_000,
  headers: { Accept: "application/json" },
});

http.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("dr.auth.token")
      : null;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization =
      `Bearer ${token}`;
  }
  return config;
});

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    http.get<T>(url, config).then((r) => r.data),
  post: <T>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => http.post<T>(url, body, config).then((r) => r.data),
  put: <T>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => http.put<T>(url, body, config).then((r) => r.data),
  patch: <T>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> => http.patch<T>(url, body, config).then((r) => r.data),
  del: <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
    http.delete<T>(url, config).then((r) => r.data),
};

export type Api = typeof api;
