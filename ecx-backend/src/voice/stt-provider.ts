/**
 * Speech-to-text seam (swappable, like LlmProvider). STT is used ONLY for the free-text intent
 * ("buy me light") — never for PIN or amounts (those are DTMF, D1). A Whisper-compatible adapter
 * plugs in here later; FakeSttProvider covers tests and offline demos.
 */
export const STT_PROVIDER = Symbol('STT_PROVIDER');

export interface SttProvider {
  /** Transcribe a recording (Africa's Talking gives a recordingUrl). Returns best-effort text. */
  transcribe(audioUrl: string): Promise<string>;
}
