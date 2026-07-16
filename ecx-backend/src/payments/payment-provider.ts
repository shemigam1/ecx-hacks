import { Kobo } from '../contracts';

/** DI token so modules inject the interface, not a concrete class. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface BillerInfo {
  id: string;
  name: string;
  category: 'ELECTRICITY' | 'CABLE' | 'AIRTIME' | 'DATA';
}

export interface CustomerInfo {
  name: string;
  address?: string;
}

export type ProviderStatus = 'EXECUTED' | 'PENDING' | 'FAILED';

export interface ProviderResult {
  status: ProviderStatus;
  providerRef: string;
  token?: string; // prepaid electricity token, when applicable
  units?: string; // e.g. "76.9 kWh" — for read-back realism
  message?: string;
}

/**
 * Aggregator-ready payment rail (D8). `MockProvider` implements this now; a real provider
 * (VTpass / Flutterwave) drops in behind the same interface later with no orchestrator changes.
 * `requestId` is our idempotencyKey mapped to the provider's request reference, so retries dedupe
 * on their side too. `vend*` can return EXECUTED (token available) or PENDING (poll via requeryStatus).
 */
export interface PaymentProvider {
  resolveBiller(idOrAlias: string): Promise<BillerInfo | null>;
  verifyCustomer(billerId: string, customerRef: string): Promise<CustomerInfo>;
  vendElectricity(meterNo: string, amount: Kobo, requestId: string): Promise<ProviderResult>;
  paySubscription(billerId: string, customerRef: string, amount: Kobo, requestId: string): Promise<ProviderResult>;
  transfer(recipient: string, amount: Kobo, requestId: string): Promise<ProviderResult>;
  requeryStatus(providerRef: string): Promise<ProviderResult>;
}
