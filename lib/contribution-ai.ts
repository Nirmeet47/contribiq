function getAiApiBaseUrl() {
  return process.env.AI_API_BASE_URL ?? "http://127.0.0.1:8001";
}

export async function processContributionWithAi(contributionId: string) {
  const response = await fetch(`${getAiApiBaseUrl()}/contributions/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contributionId }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ contributionId: string; processed: boolean }>;
}
