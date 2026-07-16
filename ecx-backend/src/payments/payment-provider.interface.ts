export interface VerifyCustomerResult {
  customerName: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface PaymentResult {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  providerRef: string;
  token?: string; // populated only for electricity bill payments
  error?: string;
}

export interface PaymentProvider {
  /**
   * Verify the customer details with the utility/biller provider (e.g. verify meter number).
   */
  verifyCustomer(billerId: string, recipient: string): Promise<VerifyCustomerResult>;

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

  /**
   * Requery the status of a transaction that previously returned PENDING.
   */
  requeryStatus(idempotencyKey: string): Promise<PaymentResult>;
}
