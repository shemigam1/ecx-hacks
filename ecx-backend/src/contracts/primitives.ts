/**
 * Shared primitives used across every module and every seam.
 * See BACKEND_WORKPLAN.md §3 and PROJECT.md §4.
 */

/**
 * Money is ALWAYS an integer number of minor units (kobo). Never a float.
 * ₦5,000 => 500_000. Do all arithmetic in kobo; format to naira only at the edges.
 */
export type Kobo = number;

/** Convert whole naira to kobo. Throws on non-finite input; floors fractional kobo defensively. */
export function naira(amount: number): Kobo {
  if (!Number.isFinite(amount)) throw new Error(`naira(): not a finite number: ${amount}`);
  return Math.round(amount * 100);
}

/** Format kobo as a naira string for speech/UI, e.g. 500000 => "₦5,000.00". */
export function formatNaira(k: Kobo): string {
  return `₦${(k / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Every channel a request can arrive on. Phone channel defaults to the narrowest scope. */
export type Channel = 'VOICE' | 'WHATSAPP' | 'WEB';

export type Role = 'OWNER' | 'TRUSTED_CONTACT' | 'DELEGATE';

/**
 * The authenticated actor behind a request. Produced by AuthModule (Dev B),
 * consumed by REST/WS handlers (both devs). Dev A uses a dev-stub until the real guard lands.
 */
export interface Principal {
  userId: string;
  accountId: string;
  role: Role;
  /** Present when the actor acts through a scoped credential (delegate or AI agent). */
  credentialId?: string;
  channel: Channel;
}
