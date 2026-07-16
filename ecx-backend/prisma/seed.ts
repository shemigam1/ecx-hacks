/**
 * Demo seed: billers, an owner + trusted contact, a demo account, and the AI-agent credential with a
 * realistic policy. Idempotent (upserts). Run: `pnpm db:seed`.
 *
 * Credential `cred_demo` policy:
 *   - BILLER_ALLOWLIST: ikeja_electric, eko_electric, dstv, gotv, mtn_airtime
 *   - SPEND_CAP_PER_TX: ₦20,000     - SPEND_CAP_MONTHLY: ₦50,000
 *   - COSIGN_THRESHOLD: ₦10,000
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// System-wide billers. Not all are on every credential's allowlist — `ibedc` is deliberately
// left OUT of cred_demo's allowlist to demo a BILLER_NOT_ALLOWLISTED denial against a real biller.
const BILLERS = [
  { id: 'ikeja_electric', name: 'Ikeja Electric', category: 'ELECTRICITY', providerRef: 'ikeja-prepaid', aliases: ['NEPA', 'light', 'ikeja'] },
  { id: 'eko_electric', name: 'Eko Electricity (EKEDC)', category: 'ELECTRICITY', providerRef: 'eko-prepaid', aliases: ['eko', 'ekedc'] },
  { id: 'ibedc', name: 'Ibadan Electricity (IBEDC)', category: 'ELECTRICITY', providerRef: 'ibedc-prepaid', aliases: ['ibadan', 'ibedc'] },
  { id: 'dstv', name: 'DSTV', category: 'CABLE', providerRef: 'dstv-sub', aliases: ['dstv'] },
  { id: 'gotv', name: 'GOtv', category: 'CABLE', providerRef: 'gotv-sub', aliases: ['gotv'] },
  { id: 'mtn_airtime', name: 'MTN Airtime', category: 'AIRTIME', providerRef: 'mtn-vtu', aliases: ['mtn', 'airtime'] },
];

const ALLOWLISTED_BILLER_IDS = ['ikeja_electric', 'eko_electric', 'dstv', 'gotv', 'mtn_airtime'];

async function main() {
  for (const b of BILLERS) {
    await prisma.biller.upsert({ where: { id: b.id }, update: b, create: b });
  }

  const owner = await prisma.user.upsert({
    where: { id: 'user_owner' },
    update: {},
    create: { id: 'user_owner', name: 'Mama Nkechi', role: 'OWNER', languagePref: 'pcm', phoneMsisdn: '+2348030000001' },
  });
  await prisma.user.upsert({
    where: { id: 'user_ada' },
    update: {},
    create: { id: 'user_ada', name: 'Ada (daughter)', role: 'TRUSTED_CONTACT', languagePref: 'en', phoneMsisdn: '+2348030000002' },
  });

  const account = await prisma.account.upsert({
    where: { id: 'acct_demo' },
    update: {},
    create: { id: 'acct_demo', ownerUserId: owner.id, balance: 100_000_000 }, // ₦1,000,000 mock
  });

  await prisma.credential.upsert({
    where: { id: 'cred_demo' },
    update: { status: 'ACTIVE' },
    create: { id: 'cred_demo', accountId: account.id, delegateType: 'AI_AGENT', label: 'Steward Agent', status: 'ACTIVE' },
  });

  // Reset rules to a known state.
  await prisma.policyRule.deleteMany({ where: { credentialId: 'cred_demo' } });
  await prisma.policyRule.createMany({
    data: [
      { credentialId: 'cred_demo', ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ALLOWLISTED_BILLER_IDS } },
      { credentialId: 'cred_demo', ruleType: 'SPEND_CAP_PER_TX', params: { limit: 2_000_000 } },
      { credentialId: 'cred_demo', ruleType: 'SPEND_CAP_MONTHLY', params: { limit: 5_000_000 } },
      { credentialId: 'cred_demo', ruleType: 'COSIGN_THRESHOLD', params: { threshold: 1_000_000 } },
    ],
  });

  console.log(`Seeded: ${BILLERS.length} billers, owner+trusted contact, acct_demo, cred_demo (4 rules).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
