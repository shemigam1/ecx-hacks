/**
 * Model-agnostic LLM seam. The agent depends on this, not on any vendor SDK, so the model is a config
 * choice (D: Qwen3 via OpenRouter) — swappable without code changes. Because the policy engine is the
 * trust boundary, the model is NOT security-critical; swapping is a two-way door.
 */

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant turns that request tool calls. */
  toolCalls?: LlmToolCall[];
  /** Present on tool-result turns; links back to the call. */
  toolCallId?: string;
}

/** JSON-Schema tool definition (OpenAI/Anthropic-compatible shape). */
export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmResponse {
  /** Assistant text, if any. */
  text?: string;
  /** Tool calls the model wants executed. When present, the agent runs them and loops. */
  toolCalls?: LlmToolCall[];
}

export interface LlmProvider {
  complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmResponse>;
}
