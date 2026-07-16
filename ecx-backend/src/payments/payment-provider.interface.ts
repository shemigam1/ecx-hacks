export interface PaymentResult {
  providerRef: string;
  token?: string; // populated only for electricity bill payments
}

export interface PaymentProvider {
  /**
   * Execute the transaction via the external payment system.
   * Enforces idempotency via the provided idempotencyKey.
   */
  execute(
    idempotencyKey: string,
    amount: number,
    billerId?: string,
    recipient?: string,
  ): Promise<PaymentResult>;
}
