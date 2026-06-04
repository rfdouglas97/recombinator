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
  return (
    msg.includes('fetch failed') ||
    /Anthropic (429|529|500|502|503|504)/.test(msg) ||
    /OpenAI (429|500|502|503|504)/.test(msg)
  );
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

export async function chatJson({ system, user, apiConfig }) {
  if (apiConfig.provider === 'anthropic') {
    return withRetries(() => anthropicChatJson({ system, user, apiConfig }));
  }
  return withRetries(() => openaiChatJson({ system, user, apiConfig }));
}

/** Multi-turn plain-text chat (no JSON mode). */
export async function chatMessages({ system, messages, apiConfig, maxTokens = 2048 }) {
  if (apiConfig.provider === 'anthropic') {
    return withRetries(() => anthropicChatMessages({ system, messages, apiConfig, maxTokens }));
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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiConfig.apiKey,
      'anthropic-version': apiConfig.anthropicVersion ?? '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: apiConfig.model,
      max_tokens: maxTokens ?? apiConfig.maxTokens ?? 2048,
      temperature: 0.3,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const block = data.content?.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('Empty Anthropic response');
  return block.text.trim();
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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiConfig.apiKey,
      'anthropic-version': apiConfig.anthropicVersion ?? '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: apiConfig.model,
      max_tokens: apiConfig.maxTokens ?? 4096,
      temperature: 0.2,
      system: system + JSON_INSTRUCTION,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const block = data.content?.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('Empty Anthropic response');
  return parseJsonContent(block.text);
}

export function resolveApiConfig() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '4096', 10),
      anthropicVersion: process.env.ANTHROPIC_VERSION ?? '2023-06-01',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com',
    };
  }

  return null;
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
