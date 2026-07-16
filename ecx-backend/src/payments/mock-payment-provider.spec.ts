import { MockPaymentProvider } from './mock-payment-provider.service';

describe('MockPaymentProvider', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
    provider.setLatencyEnabled(false); // disable latency for fast test runs
  });

  it('generates a unique providerRef on new keys', async () => {
    const res1 = await provider.execute('key1', 500000, 'dstv');
    const res2 = await provider.execute('key2', 500000, 'dstv');

    expect(res1.providerRef).toBeDefined();
    expect(res2.providerRef).toBeDefined();
    expect(res1.providerRef).not.toBe(res2.providerRef);
  });

  it('enforces idempotency on duplicate keys', async () => {
    const res1 = await provider.execute('key_dup', 500000, 'ikeja_electric');
    const res2 = await provider.execute('key_dup', 500000, 'ikeja_electric');

    expect(res2.providerRef).toBe(res1.providerRef);
    expect(res2.token).toBe(res1.token);
  });

  it('does not generate a token for non-electricity billers', async () => {
    const res = await provider.execute('key_sub', 500000, 'dstv');
    expect(res.token).toBeUndefined();
  });

  it('generates a 20-digit formatted token for electricity billers', async () => {
    const res = await provider.execute('key_elec', 500000, 'ikeja_electric');
    expect(res.token).toBeDefined();
    
    // Check format: 20 digits split into 5 groups of 4 by spaces
    // e.g. "1234 5678 9012 3456 7890" (length should be 24)
    expect(res.token).toHaveLength(24);
    expect(res.token).toMatch(/^\d{4} \d{4} \d{4} \d{4} \d{4}$/);
  });

  it('generates a 20-digit formatted token for other electric biller variations', async () => {
    const res1 = await provider.execute('k1', 1000, 'ekedc');
    const res2 = await provider.execute('k2', 1000, 'buy_light_biller');
    const res3 = await provider.execute('k3', 1000, 'nepa_biller');

    expect(res1.token).toBeDefined();
    expect(res2.token).toBeDefined();
    expect(res3.token).toBeDefined();
  });
});
