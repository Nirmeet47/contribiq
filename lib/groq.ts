// groq client — used for all LLM tasks (issue classification, skill profiling, contribution summaries)
// model: llama-3.3-70b-versatile — fast and good enough for structured extraction tasks
// docs: https://console.groq.com/docs/openai

import Groq from "groq-sdk";

const globalForGroq = globalThis as unknown as {
  groq: Groq | undefined;
};

export const groq =
  globalForGroq.groq ??
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForGroq.groq = groq;
}

// the model we use for all structured extraction — fast and handles JSON well
export const GROQ_MODEL = "llama-3.3-70b-versatile";
