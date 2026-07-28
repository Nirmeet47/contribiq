export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, response: Response, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = response.status;
    this.code = code;
    this.details = details;
  }
}

type ApiErrorPayload = {
  error?: string | {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
};

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

function errorFromPayload(payload: ApiErrorPayload) {
  if (typeof payload.error === "string") {
    return { message: payload.error };
  }

  if (payload.error && typeof payload.error === "object") {
    return {
      code: typeof payload.error.code === "string" ? payload.error.code : undefined,
      message:
        typeof payload.error.message === "string" ? payload.error.message : undefined,
      details: payload.error.details,
    };
  }

  return {
    message: typeof payload.message === "string" ? payload.message : undefined,
  };
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    let message = fallbackMessage;
    let code: string | undefined;
    let details: unknown;

    try {
      const payload = (await response.json()) as ApiErrorPayload;
      const parsed = errorFromPayload(payload);
      message = parsed.message ?? message;
      code = parsed.code;
      details = parsed.details;
    } catch {
      // Keep the caller-provided fallback when the response is not JSON.
    }

    throw new ApiClientError(message, response, code, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function fetchWithTimeout(url: string, init: ApiRequestInit = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, {
      ...requestInit,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function apiGet<T>(
  url: string,
  fallbackMessage = "Request failed",
  init?: ApiRequestInit
) {
  const response = await fetchWithTimeout(url, init);
  return parseJsonResponse<T>(response, fallbackMessage);
}

export async function apiJson<T>(
  url: string,
  {
    method = "POST",
    body,
    fallbackMessage = "Request failed",
    timeoutMs,
  }: {
    method?: "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    fallbackMessage?: string;
    timeoutMs?: number;
  } = {}
) {
  const response = await fetchWithTimeout(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs,
  });

  return parseJsonResponse<T>(response, fallbackMessage);
}
