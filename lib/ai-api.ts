function getAiApiBaseUrl() {
  return process.env.AI_API_BASE_URL ?? "http://127.0.0.1:8001";
}

export async function scoreMatchesForUser(userId: string) {
  const response = await fetch(`${getAiApiBaseUrl()}/matches/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ scope: string; deleted: number; upserted: number }>;
}
