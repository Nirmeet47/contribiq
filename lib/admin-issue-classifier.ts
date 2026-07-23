import { z } from "zod";
import { GROQ_MODEL, groq } from "@/lib/groq";
import { formatIssueEmbeddingText, canonicalizeSkills } from "@/lib/skills";

export const ISSUE_CLASSIFICATION_RATE_LIMIT = {
  limit: 5,
  windowSeconds: 10 * 60,
} as const;

const SYSTEM_PROMPT = `
You classify GitHub issues for open-source contributor matching.
Return only strict JSON. Do not include markdown, commentary, code fences, or extra keys.
The JSON object must contain:
- difficulty: one of "beginner", "intermediate", "advanced"
- estimatedHours: a number
- requiredSkills: an array of strings
- issueType: one of "bug", "feature", "docs", "refactor"
- aiSummary: a 2-3 sentence plain-English summary explaining what the issue is, what's broken or needed, and what kind of change would fix it
- requiredSkills must use canonical display names when obvious, e.g. TypeScript, JavaScript, Node.js, Next.js, React, Tailwind CSS, tRPC, Prisma, Supabase, PostgreSQL, GraphQL, MongoDB, Redis, Docker, Kubernetes
`;

const issueClassificationSchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedHours: z.number().positive(),
  requiredSkills: z.array(z.string().trim().min(1)).min(1),
  issueType: z.enum(["bug", "feature", "docs", "refactor"]),
  aiSummary: z.string().trim().min(1),
});

export type IssueClassification = z.infer<typeof issueClassificationSchema> & {
  requiredSkills: string[];
};

type ClassifiableIssue = {
  title: string;
  body: string | null;
  labels: string[];
};

function parseJsonObject(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw) as unknown;
}

export function canonicalRequiredSkills(skills: string[]) {
  return canonicalizeSkills(skills.map((name) => ({ name, level: "learning" }))).map(
    (skill) => skill.name
  );
}

export async function classifyIssueWithGroq(issue: ClassifiableIssue) {
  const completion = await groq.chat.completions.create({
    model: process.env.ISSUE_CLASSIFIER_MODEL || GROQ_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          title: issue.title,
          body: issue.body || "",
          labels: issue.labels || [],
        }),
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content || "";
  const parsed = issueClassificationSchema.parse(parseJsonObject(raw));

  return {
    ...parsed,
    requiredSkills: canonicalRequiredSkills(parsed.requiredSkills),
  };
}

export async function embedIssueRequiredSkills(requiredSkills: string[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || requiredSkills.length === 0) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: {
          parts: [{ text: formatIssueEmbeddingText(requiredSkills) }],
        },
        outputDimensionality: 768,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini embedding failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  return payload.embedding?.values?.length ? payload.embedding.values : null;
}
