async function parseJsonResponse<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Keep the caller-provided fallback when the response is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function apiGet<T>(
  url: string,
  fallbackMessage = "Request failed",
  init?: RequestInit
) {
  const response = await fetch(url, init);
  return parseJsonResponse<T>(response, fallbackMessage);
}

export async function apiJson<T>(
  url: string,
  {
    method = "POST",
    body,
    fallbackMessage = "Request failed",
  }: {
    method?: "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    fallbackMessage?: string;
  } = {}
) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseJsonResponse<T>(response, fallbackMessage);
}
