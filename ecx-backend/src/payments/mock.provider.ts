import { Injectable } from '@nestjs/common';
import { Kobo } from '../contracts';
import { BillerInfo, CustomerInfo, PaymentProvider, ProviderResult } from './payment-provider';

/** Seeded billers mirror the DB seed and the PRD's list. */
const SEEDED_BILLERS: Record<string, BillerInfo> = {
  ikeja_electric: { id: 'ikeja_electric', name: 'Ikeja Electric', category: 'ELECTRICITY' },
  eko_electric: { id: 'eko_electric', name: 'Eko Electricity (EKEDC)', category: 'ELECTRICITY' },
  dstv: { id: 'dstv', name: 'DSTV', category: 'CABLE' },
  gotv: { id: 'gotv', name: 'GOtv', category: 'CABLE' },
  mtn_airtime: { id: 'mtn_airtime', name: 'MTN Airtime', category: 'AIRTIME' },
};

const NGN_PER_KWH = 65; // pretend tariff, for realistic units read-back

/**
 * Deterministic-enough mock rail with realistic latency and a 20-digit prepaid token.
 * The always-works demo fallback (R3). Swapped for a real provider behind PaymentProvider.
 */
@Injectable()
export class MockProvider implements PaymentProvider {
  async resolveBiller(idOrAlias: string): Promise<BillerInfo | null> {
    return SEEDED_BILLERS[idOrAlias] ?? null;
  }

  async verifyCustomer(_billerId: string, customerRef: string): Promise<CustomerInfo> {
    // Mock rule: a 6+ digit meter/customer ref resolves; anything shorter "fails" verification.
    if (!/^\d{6,}$/.test(customerRef)) throw new Error(`Customer/meter not found: ${customerRef}`);
    return { name: 'MAMA NKECHI OKAFOR', address: '12 Allen Avenue, Ikeja, Lagos' };
  }

  async vendElectricity(_meterNo: string, amount: Kobo, requestId: string): Promise<ProviderResult> {
    await this.latency();
    return {
      status: 'EXECUTED',
      providerRef: `MOCK-${requestId}`,
      token: this.generateToken(),
      units: `${(amount / 100 / NGN_PER_KWH).toFixed(1)} kWh`,
    };
  }

  async paySubscription(_billerId: string, _ref: string, _amount: Kobo, requestId: string): Promise<ProviderResult> {
    await this.latency();
    return { status: 'EXECUTED', providerRef: `MOCK-${requestId}` };
  }

  async transfer(_recipient: string, _amount: Kobo, requestId: string): Promise<ProviderResult> {
    await this.latency();
    return { status: 'EXECUTED', providerRef: `MOCK-${requestId}` };
  }

  async requeryStatus(providerRef: string): Promise<ProviderResult> {
    return { status: 'EXECUTED', providerRef };
  }

  /** 20 digits grouped in 4s for slow spoken read-back, e.g. "1234 5678 9012 3456 7890". */
  private generateToken(): string {
    let digits = '';
    for (let i = 0; i < 20; i++) digits += Math.floor(Math.random() * 10);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  private latency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 150));
  }
}
