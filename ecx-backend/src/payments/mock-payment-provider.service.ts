import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentProvider, PaymentResult } from './payment-provider.interface';

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

    // 3. Generate reference and check if electricity token is needed
    const providerRef = `ref_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const result: PaymentResult = { providerRef };

    if (billerId && this.isElectricityBiller(billerId)) {
      result.token = this.generate20DigitToken();
    }

    // 4. Save to cache
    this.cache.set(idempotencyKey, result);

    return result;
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
