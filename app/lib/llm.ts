import Groq from "groq-sdk";

// Thrown when no provider could answer. Callers MUST handle this — never let a
// provider outage reach the user (or the extractor) disguised as model output.
export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMUnavailableError";
  }
}

// Groq retires model IDs without warning, and it has now taken RentBot down
// twice: first llama3-8b-8192, then llama-3.1-8b-instant (404 model_not_found,
// which killed every chat reply AND every data extraction until it was noticed).
// Hardcoding one more name just schedules the third outage — so try a list, and
// remember whichever one answers.
const CANDIDATE_MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
].filter((m): m is string => Boolean(m));

// Cached across invocations of a warm lambda so we don't re-probe on every call.
let workingModel: string | null = null;

// Groq says "does not exist or you do not have access to it" for both a retired
// model and one this account can't use. Either way the answer is the same: move
// on to the next candidate rather than failing the request.
function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const text = err instanceof Error ? err.message : String(err);
  return (
    status === 404 ||
    /model_not_found|does not exist|decommissioned|deprecated/i.test(text)
  );
}

async function callGroq(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const groq = new Groq({ apiKey });
  // Start from the known-good model when we have one, then the rest as backup.
  const order = workingModel
    ? [workingModel, ...CANDIDATE_MODELS.filter((m) => m !== workingModel)]
    : CANDIDATE_MODELS;

  let lastErr: unknown = new Error("No Groq models configured");

  for (const model of order) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ] as Parameters<typeof groq.chat.completions.create>[0]["messages"],
        max_tokens: maxTokens,
        temperature: 0.7,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error(`Empty response from Groq (${model})`);

      if (workingModel !== model) {
        console.info(`LLM: using Groq model "${model}"`);
        workingModel = model;
      }
      return content;
    } catch (err) {
      lastErr = err;
      if (isModelUnavailable(err)) {
        console.warn(`LLM: Groq model "${model}" unavailable, trying next.`);
        if (workingModel === model) workingModel = null;
        continue;
      }
      // Not a model problem (rate limit, network, auth) — stop burning candidates.
      throw err;
    }
  }
  throw lastErr;
}

async function callOpenRouter(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rentindex.com.ng",
      "X-Title": "RentInDex",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    // The old code discarded this body and reported only "Empty response",
    // which is why the fallback's real failure was invisible in the logs.
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`OpenRouter returned non-JSON: ${body.slice(0, 300)}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter returned no content: ${body.slice(0, 300)}`);
  }
  return content;
}

// Ask an LLM. Throws LLMUnavailableError if every provider fails.
//
// It deliberately does NOT return a friendly "having trouble connecting"
// sentence on failure any more. That old behaviour was the reason a Groq model
// retirement turned into silent data loss: the extractor received that sentence
// as if it were the model's JSON, failed to parse it, and reported
// `parse_error` — so an outage looked like a parsing quirk for weeks. A caller
// that wants to show the user a friendly message must catch this and say so
// itself, at the layer where a user-facing string actually belongs.
export async function callLLM(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  maxTokens: number = 500
): Promise<string> {
  try {
    return await callGroq(messages, systemPrompt, maxTokens);
  } catch (groqErr) {
    console.error("LLM: Groq failed, trying OpenRouter:", groqErr);
    try {
      return await callOpenRouter(messages, systemPrompt, maxTokens);
    } catch (orErr) {
      console.error("LLM: OpenRouter also failed:", orErr);
      throw new LLMUnavailableError(
        `All LLM providers failed. Groq: ${
          groqErr instanceof Error ? groqErr.message : groqErr
        } | OpenRouter: ${orErr instanceof Error ? orErr.message : orErr}`
      );
    }
  }
}

// Which Groq model is actually answering right now — for /api/health.
export function activeModel(): string | null {
  return workingModel;
}

export interface ModelHealth {
  ok: boolean;
  detail: string;
  usable: string[];
  configured: string[];
}

// Health probe that costs nothing: list the models the key can see and check
// that at least one candidate is among them. This is the exact check that would
// have caught the llama-3.1-8b-instant retirement the day it happened, instead
// of it surfacing weeks later as an empty dataset.
export async function groqModelHealth(): Promise<ModelHealth> {
  const configured = CANDIDATE_MODELS;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, detail: "GROQ_API_KEY is not set", usable: [], configured };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        detail: `Groq models endpoint returned ${res.status}: ${body.slice(0, 200)}`,
        usable: [],
        configured,
      };
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const available = new Set((data.data ?? []).map((m) => m.id));
    const usable = configured.filter((m) => available.has(m));
    return {
      ok: usable.length > 0,
      detail: usable.length
        ? `${usable.length} of ${configured.length} configured models available`
        : `NONE of the configured models exist on this account — RentBot cannot reply. Set GROQ_MODEL to one of: ${[...available].slice(0, 8).join(", ")}`,
      usable,
      configured,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Could not reach Groq: ${err instanceof Error ? err.message : err}`,
      usable: [],
      configured,
    };
  }
}
