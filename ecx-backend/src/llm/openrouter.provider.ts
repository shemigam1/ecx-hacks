import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmMessage, LlmProvider, LlmResponse, LlmToolDef } from './llm-provider';

/**
 * OpenAI-compatible adapter → OpenRouter (default target: Qwen3). The same adapter works against
 * Together / Fireworks / Groq or any OpenAI-compatible gateway by changing base URL + model.
 * Config via env: OPENROUTER_API_KEY, AGENT_MODEL (e.g. "qwen/qwen3-235b-a22b"), optional OPENROUTER_BASE_URL.
 */
@Injectable()
export class OpenRouterLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenRouterLlmProvider.name);
  private readonly client: OpenAI;
  private readonly model = process.env.AGENT_MODEL ?? 'qwen/qwen3-235b-a22b';

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? 'missing-key',
      baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    });
  }

  async complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: 'auto',
      temperature: 0,
    });

    const choice = res.choices[0]?.message;
    const toolCalls = (choice?.tool_calls ?? [])
      .filter((c): c is typeof c & { type: 'function' } => c.type === 'function')
      .map((c) => ({ id: c.id, name: c.function.name, arguments: safeJson(c.function.arguments) }));

    return { text: choice?.content ?? undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
  }
}

function toOpenAiMessage(m: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })),
    };
  }
  return { role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam;
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}
