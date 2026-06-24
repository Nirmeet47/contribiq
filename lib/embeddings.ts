// embeddings via gemini-embedding-001 (google ai studio — free tier)
// outputs 768-dim vectors, stored in pgvector in supabase
// get your key at: aistudio.google.com → get api key (free, no credit card)

import { GoogleGenAI } from "@google/genai";

const globalForGenAI = globalThis as unknown as {
  genai: GoogleGenAI | undefined;
};

export const genai =
  globalForGenAI.genai ??
  new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForGenAI.genai = genai;
}

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

// embed a single string — used for issue requiredSkills and skill profiles
export async function embed(text: string): Promise<number[]> {
  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  return response.embeddings![0].values!;
}

// embed multiple strings — used by batch classification and match scoring jobs
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results = await Promise.all(texts.map((t) => embed(t)));
  return results;
}
