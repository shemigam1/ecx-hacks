/**
 * Africa's Talking Voice XML builders. AT drives the call by POSTing to your webhook; you reply with
 * `<Response>` XML telling it what to do next (Say / GetDigits / Record / Play / Hangup). Pure
 * functions — unit-tested, no I/O.
 *
 * Callback URLs must be absolute and AT-reachable — set PUBLIC_BASE_URL (e.g. your ngrok/host URL).
 */

const DEFAULT_VOICE = process.env.AT_VOICE ?? 'en-US-Standard-C';

export function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function callbackUrl(path: string): string {
  const base = process.env.PUBLIC_BASE_URL ?? '';
  return `${base}${path}`;
}

/** `<Say>` — AT's built-in TTS. */
export function say(text: string, voice: string = DEFAULT_VOICE): string {
  return `<Say voice="${xmlEscape(voice)}" playBeep="false">${xmlEscape(text)}</Say>`;
}

/** `<Play url>` — play a hosted audio file (for local-language TTS via YarnGPT/Spitch later). */
export function play(url: string): string {
  return `<Play url="${xmlEscape(url)}"/>`;
}

export interface GetDigitsOpts {
  path: string; // callback path, prefixed with PUBLIC_BASE_URL
  numDigits?: number;
  finishOnKey?: string;
  timeout?: number;
}

/** `<GetDigits>` — DTMF entry (PIN, confirmation). Digits come back as `dtmfDigits`. */
export function getDigits(opts: GetDigitsOpts, prompt: string): string {
  const attrs = [
    `callbackUrl="${xmlEscape(callbackUrl(opts.path))}"`,
    opts.numDigits != null ? `numDigits="${opts.numDigits}"` : '',
    `finishOnKey="${xmlEscape(opts.finishOnKey ?? '#')}"`,
    `timeout="${opts.timeout ?? 30}"`,
  ]
    .filter(Boolean)
    .join(' ');
  return `<GetDigits ${attrs}>${prompt}</GetDigits>`;
}

export interface RecordOpts {
  path: string;
  maxLength?: number; // seconds
  finishOnKey?: string;
}

/** `<Record>` (partial) — records one utterance, POSTs recordingUrl to the callback, then continues. */
export function record(opts: RecordOpts, prompt: string): string {
  const attrs = [
    `finishOnKey="${xmlEscape(opts.finishOnKey ?? '#')}"`,
    `maxLength="${opts.maxLength ?? 15}"`,
    'trimSilence="true"',
    'playBeep="true"',
    `callbackUrl="${xmlEscape(callbackUrl(opts.path))}"`,
  ].join(' ');
  return `<Record ${attrs}>${prompt}</Record>`;
}

export function hangup(): string {
  return '<Hangup/>';
}

export function reject(): string {
  return '<Reject/>';
}

/** Wrap children in a full AT `<Response>` document. */
export function response(...children: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${children.join('')}</Response>`;
}

/**
 * Turn a token into digit-by-digit speakable text so TTS reads "1 2 3 4" not "one thousand...".
 * "1234 5678" -> "1 2 3 4, 5 6 7 8".
 */
export function speakDigits(token: string): string {
  const digits = token.replace(/\D/g, '');
  const groups = digits.match(/.{1,4}/g) ?? [];
  return groups.map((g) => g.split('').join(' ')).join(', ');
}
