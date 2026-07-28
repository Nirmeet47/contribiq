export const AI_SERVICE_TOKEN_HEADER = "X-ContribIQ-Service-Token";

export function aiServiceHeaders(headers: HeadersInit = {}) {
  const token = process.env.CONTRIBIQ_SERVICE_TOKEN;
  return {
    ...headers,
    ...(token ? { [AI_SERVICE_TOKEN_HEADER]: token } : {}),
  };
}
