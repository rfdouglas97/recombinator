import Anthropic from '@anthropic-ai/sdk';

const JSON_INSTRUCTION =
  '\n\nRespond with a single valid JSON object only. No markdown code fences or extra text.';

function parseJsonContent(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

function isRetryableError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes('fetch failed') || /OpenAI (429|500|502|503|504)/.test(msg);
}

async function withRetries(fn, { retries = 4, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRetryableError(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

const anthropicClients = new Map();

function getAnthropicClient(apiConfig) {
  const key = apiConfig.apiKey;
  let client = anthropicClients.get(key);
  if (!client) {
    // The SDK retries 429/5xx/529 with backoff using typed errors.
    client = new Anthropic({ apiKey: key, maxRetries: 4 });
    anthropicClients.set(key, client);
  }
  return client;
}

/** temperature/top_p/top_k are removed on Opus 4.7+ and Fable-tier models (400 if sent). */
function samplingSupported(model) {
  return !/opus-4-[789]|fable|mythos/.test(String(model ?? ''));
}

/** Normalize a system prompt to the block-array form so callers can attach cache_control. */
function systemBlocks(system) {
  if (Array.isArray(system)) return system;
  return [{ type: 'text', text: String(system ?? '') }];
}

function systemText(system) {
  return systemBlocks(system)
    .map((b) => b.text)
    .join('\n\n');
}

function firstTextBlock(message) {
  const block = message.content?.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('Empty Anthropic response');
  return block.text;
}

/**
 * Schema-enforced JSON via Anthropic structured outputs (output_config.format).
 * Streams internally (avoids HTTP timeouts) and fires `onStart` on the first
 * stream event — used to stagger parallel calls so they share a prompt-cache
 * entry (a cache write becomes readable once the first response starts).
 *
 * `system` and `messages` content may be block arrays carrying cache_control.
 * Falls back to prompt-based JSON on the OpenAI provider (no schema guarantee).
 *
 * Returns { data, usage }.
 */
export async function chatStructured({
  system,
  user,
  messages,
  schema,
  apiConfig = resolveApiConfig(),
  model,
  temperature = 0.2,
  maxTokens = 3000,
  effort,
  onStart,
}) {
  if (!apiConfig) throw new Error('No ANTHROPIC_API_KEY or OPENAI_API_KEY configured in .env');

  if (apiConfig.provider !== 'anthropic') {
    const data = await withRetries(() =>
      openaiChatJson({
        system: systemText(system),
        user: typeof user === 'string' ? user : JSON.stringify(user),
        apiConfig,
      })
    );
    onStart?.();
    return { data, usage: null };
  }

  const client = getAnthropicClient(apiConfig);
  const resolvedModel = model ?? apiConfig.model;
  const request = {
    model: resolvedModel,
    max_tokens: maxTokens,
    ...(samplingSupported(resolvedModel) ? { temperature } : {}),
    system: systemBlocks(system),
    messages: messages ?? [{ role: 'user', content: user }],
    output_config: {
      format: { type: 'json_schema', schema },
      ...(effort ? { effort } : {}),
    },
  };

  const stream = client.messages.stream(request);
  if (onStart) {
    let started = false;
    stream.on('streamEvent', () => {
      if (!started) {
        started = true;
        onStart();
      }
    });
  }
  const message = await stream.finalMessage();
  return { data: JSON.parse(firstTextBlock(message)), usage: message.usage };
}

export async function chatJson({ system, user, apiConfig }) {
  if (apiConfig.provider === 'anthropic') {
    return anthropicChatJson({ system, user, apiConfig });
  }
  return withRetries(() => openaiChatJson({ system, user, apiConfig }));
}

/** Multi-turn plain-text chat (no JSON mode). */
export async function chatMessages({ system, messages, apiConfig, maxTokens = 2048 }) {
  if (apiConfig.provider === 'anthropic') {
    return anthropicChatMessages({ system, messages, apiConfig, maxTokens });
  }
  return withRetries(() => openaiChatMessages({ system, messages, apiConfig, maxTokens }));
}

async function openaiChatMessages({ system, messages, apiConfig, maxTokens }) {
  const url = `${apiConfig.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiConfig.model,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');
  return content.trim();
}

async function anthropicChatMessages({ system, messages, apiConfig, maxTokens }) {
  const client = getAnthropicClient(apiConfig);
  const message = await client.messages.create({
    model: apiConfig.model,
    max_tokens: maxTokens ?? apiConfig.maxTokens ?? 2048,
    temperature: 0.3,
    system,
    messages,
  });
  return firstTextBlock(message).trim();
}

async function openaiChatJson({ system, user, apiConfig }) {
  const url = `${apiConfig.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiConfig.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system + JSON_INSTRUCTION },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');
  return parseJsonContent(content);
}

async function anthropicChatJson({ system, user, apiConfig }) {
  const client = getAnthropicClient(apiConfig);
  const message = await client.messages.create({
    model: apiConfig.model,
    max_tokens: apiConfig.maxTokens ?? 4096,
    temperature: 0.2,
    system: system + JSON_INSTRUCTION,
    messages: [{ role: 'user', content: user }],
  });
  return parseJsonContent(firstTextBlock(message));
}

function normalizeApiKey(key) {
  return key?.trim().replace(/^['"]|['"]$/g, '') || '';
}

export function resolveApiConfig() {
  const anthropicKey = normalizeApiKey(process.env.ANTHROPIC_API_KEY);
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      // Sonnet 4.6: structured outputs + prompt caching (2048-token minimum prefix).
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '4096', 10),
      anthropicVersion: process.env.ANTHROPIC_VERSION ?? '2023-06-01',
    };
  }

  const openaiKey = normalizeApiKey(process.env.OPENAI_API_KEY);
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com',
    };
  }

  return null;
}

/** Cheap model for judging/query-matching; falls back to the base provider. */
export function resolveJudgeApiConfig() {
  const base = resolveApiConfig();
  if (!base) return null;
  const judgeModel =
    process.env.JUDGE_MODEL ??
    (base.provider === 'anthropic'
      ? (process.env.JUDGE_ANTHROPIC_MODEL ?? 'claude-haiku-4-5')
      : (process.env.JUDGE_OPENAI_MODEL ?? 'gpt-4o-mini'));
  return { ...base, model: judgeModel };
}

/** Explorer chat only — cheap default; does not affect classification/generator agents. */
export function resolveChatApiConfig() {
  const base = resolveApiConfig();
  if (!base) return null;
  const chatModel =
    process.env.CHAT_MODEL ??
    (base.provider === 'anthropic'
      ? (process.env.CHAT_ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001')
      : (process.env.CHAT_OPENAI_MODEL ?? 'gpt-4o-mini'));
  return {
    ...base,
    model: chatModel,
    maxTokens: parseInt(process.env.CHAT_MAX_TOKENS ?? '1024', 10),
  };
}
