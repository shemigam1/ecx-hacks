import { Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { SttProvider } from './stt-provider';

/**
 * Whisper-compatible STT (gap #8). Downloads the Africa's Talking recordingUrl and transcribes it via
 * an OpenAI-compatible `/audio/transcriptions` endpoint — works with OpenAI Whisper, Groq
 * (`whisper-large-v3`, fast + cheap), or a self-hosted faster-whisper server.
 *
 * Config: STT_API_KEY (required to enable — see the factory in VoiceModule), STT_BASE_URL (optional,
 * e.g. https://api.groq.com/openai/v1), STT_MODEL (default whisper-1). STT carries ONLY the free-text
 * intent — amounts/PIN are DTMF (R2), so accent errors can't move the wrong amount.
 */
export class WhisperSttProvider implements SttProvider {
  private readonly logger = new Logger(WhisperSttProvider.name);

  constructor(
    private readonly client: OpenAI = new OpenAI({
      apiKey: process.env.STT_API_KEY ?? 'missing-key',
      baseURL: process.env.STT_BASE_URL,
    }),
    private readonly fetchFn: typeof fetch = fetch,
    private readonly model: string = process.env.STT_MODEL ?? 'whisper-1',
  ) {}

  async transcribe(audioUrl: string): Promise<string> {
    const res = await this.fetchFn(audioUrl);
    if (!res.ok) throw new Error(`STT: failed to download recording (${res.status})`);
    const file = await toFile(Buffer.from(await res.arrayBuffer()), 'recording.wav');
    const out = await this.client.audio.transcriptions.create({ file, model: this.model });
    const text = (out.text ?? '').trim();
    this.logger.debug(`transcribed ${text.length} chars`);
    return text;
  }
}
