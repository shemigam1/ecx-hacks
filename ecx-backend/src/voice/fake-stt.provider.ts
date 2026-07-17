import { SttProvider } from './stt-provider';

/**
 * Deterministic STT for tests/offline demos. Returns a fixed transcript (configurable per instance or
 * via FAKE_STT_TRANSCRIPT env), so the whole voice flow runs without a real ASR service.
 */
export class FakeSttProvider implements SttProvider {
  constructor(private readonly transcript?: string) {}

  async transcribe(_audioUrl: string): Promise<string> {
    return this.transcript ?? process.env.FAKE_STT_TRANSCRIPT ?? 'buy me light, five thousand naira';
  }
}
