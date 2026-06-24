// embeddings via hugging face inference API (free, no credit card needed)
// model: sentence-transformers/all-MiniLM-L6-v2 → outputs 384-dim vectors
// get your token at: huggingface.co/settings/tokens (just make a free account)

import { HfInference } from "@huggingface/inference";

const globalForHf = globalThis as unknown as {
  hf: HfInference | undefined;
};

export const hf =
  globalForHf.hf ??
  new HfInference(process.env.HUGGINGFACE_TOKEN);

if (process.env.NODE_ENV !== "production") {
  globalForHf.hf = hf;
}

export const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

// embed a single string — used for issue requiredSkills and skill profiles
export async function embed(text: string): Promise<number[]> {
  const result = await hf.featureExtraction({
    model: EMBEDDING_MODEL,
    inputs: text,
  });

  // featureExtraction returns number[] | number[][] depending on input
  // for a single string it comes back as number[]
  if (Array.isArray(result) && typeof result[0] === "number") {
    return result as number[];
  }

  // if it comes back nested, take the first row
  return (result as number[][])[0];
}

// embed multiple strings in one call — more efficient for batch jobs
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const result = await hf.featureExtraction({
    model: EMBEDDING_MODEL,
    inputs: texts,
  });

  return result as number[][];
}
