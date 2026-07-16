import { LlmMessage, LlmProvider, LlmResponse, LlmToolDef } from './llm-provider';

/**
 * Scripted, deterministic LLM for tests and offline/no-key demos. You queue a list of responses; each
 * `complete()` call returns the next. Lets the entire agent loop (tool dispatch, confirmation,
 * runaway guard) be exercised with zero API key.
 */
export class FakeLlmProvider implements LlmProvider {
  private queue: LlmResponse[];
  public readonly seen: { messages: LlmMessage[]; tools: LlmToolDef[] }[] = [];

  constructor(scripted: LlmResponse[] = []) {
    this.queue = [...scripted];
  }

  push(...responses: LlmResponse[]): void {
    this.queue.push(...responses);
  }

  async complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmResponse> {
    this.seen.push({ messages: [...messages], tools });
    return this.queue.shift() ?? { text: '(no scripted response)' };
  }
}
