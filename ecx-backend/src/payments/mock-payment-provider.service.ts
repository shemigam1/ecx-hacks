import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentProvider, PaymentResult, VerifyCustomerResult } from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly cache = new Map<string, PaymentResult>();
  private enableLatency = true;

  /**
   * For testing purposes, allows disabling simulated network latency.
   */
  setLatencyEnabled(enabled: boolean) {
    this.enableLatency = enabled;
  }

  async verifyCustomer(billerId: string, recipient: string): Promise<VerifyCustomerResult> {
    await this.simulateLatency();

    if (recipient.startsWith('999') || recipient.toLowerCase() === 'fail') {
      return {
        customerName: '',
        status: 'FAILED',
        error: 'Invalid customer account or meter number',
      };
    }

    return {
      customerName: 'MAMA NKECHI',
      status: 'SUCCESS',
    };
  }

  async execute(
    idempotencyKey: string,
    amount: number,
    billerId?: string,
    recipient?: string,
  ): Promise<PaymentResult> {
    // 1. Check idempotency cache first
    const cached = this.cache.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    // 2. Simulate external API network latency
    await this.simulateLatency();

    // 3. Determine transaction status based on amount ending digits
    let status: 'SUCCESS' | 'PENDING' | 'FAILED' = 'SUCCESS';
    let error: string | undefined = undefined;

    if (amount % 100 === 99) {
      status = 'PENDING';
    } else if (amount % 100 === 98) {
      status = 'FAILED';
      error = 'Insufficient funds at aggregator';
    }

    const providerRef = `ref_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const result: PaymentResult = { status, providerRef, error };

    if (status === 'SUCCESS' && billerId && this.isElectricityBiller(billerId)) {
      result.token = this.generate20DigitToken();
    }

    // 4. Save to cache
    this.cache.set(idempotencyKey, result);

    return result;
  }

  async requeryStatus(idempotencyKey: string): Promise<PaymentResult> {
    await this.simulateLatency();

    const cached = this.cache.get(idempotencyKey);
    if (!cached) {
      return {
        status: 'FAILED',
        providerRef: 'unknown',
        error: 'Transaction not found',
      };
    }

    if (cached.status === 'PENDING') {
      // Transition from PENDING to SUCCESS upon query for test/demo simplicity
      cached.status = 'SUCCESS';
      // If we don't have a token but it's an electricity payment, generate it now
      // (For this mock, let's assume we can check if a token is needed by generating a token if it's an electric ref or if we decide to)
      // Since we don't store the original billerId directly unless we keep it in metadata or deduce it,
      // let's assume if it is a pending transaction, it could need a token. To keep it simple,
      // let's always generate a token upon success if it doesn't exist yet and looks like it could be electricity.
      // Or we can store billerId in meta or cache key. Let's make cache store the original input or meta.
      // Actually, let's check if we can check if it's electricity. Let's just generate a token if needed.
      // Wait, we can modify the cache map to store extra data, or just generate a token for any requery that had it.
      // Let's generate a token if the providerRef is mapped to an electricity purchase.
      // For simplicity, let's just generate a token on requery success if the transaction was pending.
      cached.token = this.generate20DigitToken();
      this.cache.set(idempotencyKey, cached);
    }

    return cached;
  }

  private isElectricityBiller(billerId: string): boolean {
    const lower = billerId.toLowerCase();
    return (
      lower.includes('electric') ||
      lower.includes('ekedc') ||
      lower.includes('nepa') ||
      lower.includes('light')
    );
  }

  private generate20DigitToken(): string {
    let token = '';
    for (let i = 0; i < 20; i++) {
      token += Math.floor(Math.random() * 10).toString();
      if (i % 4 === 3 && i < 19) {
        token += ' ';
      }
    }
    return token;
  }

  private async simulateLatency(): Promise<void> {
    if (this.enableLatency) {
      const ms = Math.floor(Math.random() * (1200 - 500 + 1)) + 500;
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
}
