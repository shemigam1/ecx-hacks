import { PrismaClient } from '@prisma/client';
import { encryptToken } from '../src/payments/token-crypto.helper';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing database tables...');

  // Safe dependency deletion order
  await prisma.cosignRequest.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.policyDecision.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.policyRule.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.habit.deleteMany();
  await prisma.anomalyFlag.deleteMany();
  await prisma.conversationSession.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.biller.deleteMany();

  console.log('Seeding database...');

  // 1. Seed Users
  const mama = await prisma.user.create({
    data: {
      name: 'Mama Nkechi',
      phoneMsisdn: '+2348031234567',
      languagePref: 'pcm', // Nigerian Pidgin
      role: 'OWNER',
      pinHash: 'mock_pin_hash_1234', // Simple hash placeholder for "1234"
    },
  });

  const chioma = await prisma.user.create({
    data: {
      name: 'Chioma (Daughter)',
      phoneMsisdn: '+2348037654321',
      languagePref: 'en',
      role: 'TRUSTED_CONTACT',
    },
  });

  const tunde = await prisma.user.create({
    data: {
      name: 'Tunde (Neighbor)',
      phoneMsisdn: '+2348039998888',
      languagePref: 'en',
      role: 'DELEGATE',
    },
  });

  console.log(`Seeded Users: Owner: ${mama.name}, Trusted: ${chioma.name}, Delegate: ${tunde.name}`);

  // 2. Seed Account
  const account = await prisma.account.create({
    data: {
      ownerUserId: mama.id,
      balance: 5000000, // ₦50,000.00 in kobo
    },
  });

  console.log(`Seeded Account for ${mama.name} with balance ₦50,000.00`);

  // 3. Seed Billers
  const ikeja = await prisma.biller.create({
    data: {
      name: 'Ikeja Electric',
      category: 'Electricity',
      providerRef: 'ikeja_electric_biller',
      aliases: ['ikeja', 'electric', 'light', 'nepa', 'power'],
    },
  });

  const dstv = await prisma.biller.create({
    data: {
      name: 'DSTV',
      category: 'Cable TV',
      providerRef: 'dstv_biller',
      aliases: ['dstv', 'cable', 'tv', 'multichoice'],
    },
  });

  const mtn = await prisma.biller.create({
    data: {
      name: 'MTN Airtime',
      category: 'Airtime',
      providerRef: 'mtn_airtime_biller',
      aliases: ['mtn', 'airtime', 'credit', 'card', 'load'],
    },
  });

  console.log('Seeded Billers: Ikeja Electric, DSTV, MTN Airtime');

  // 4. Seed Credentials and Policy Rules
  // AI Agent Credential
  const agentCred = await prisma.credential.create({
    data: {
      accountId: account.id,
      delegateType: 'AI_AGENT',
      label: "Mama's AI Assistant",
      status: 'ACTIVE',
    },
  });

  // AI Agent Rules
  await prisma.policyRule.createMany({
    data: [
      {
        credentialId: agentCred.id,
        ruleType: 'SPEND_CAP_MONTHLY',
        params: { limit: 5000000 }, // ₦50,000 cap
      },
      {
        credentialId: agentCred.id,
        ruleType: 'SPEND_CAP_PER_TX',
        params: { limit: 1000000 }, // ₦10,000 cap
      },
      {
        credentialId: agentCred.id,
        ruleType: 'BILLER_ALLOWLIST',
        params: { billerIds: [ikeja.id, dstv.id, mtn.id] },
      },
      {
        credentialId: agentCred.id,
        ruleType: 'COSIGN_THRESHOLD',
        params: { threshold: 500000 }, // ₦5,000 threshold
      },
      {
        credentialId: agentCred.id,
        ruleType: 'CHANNEL_SCOPE',
        params: { channels: ['VOICE', 'WHATSAPP'] },
      },
      {
        credentialId: agentCred.id,
        ruleType: 'TIME_WINDOW',
        params: { startHour: 6, endHour: 22, tz: 'Africa/Lagos' }, // 6am to 10pm WAT
      },
    ],
  });

  // Human Delegate Credential (Tunde)
  const humanCred = await prisma.credential.create({
    data: {
      accountId: account.id,
      delegateType: 'HUMAN',
      delegateUserId: tunde.id,
      label: 'Neighbor Tunde (Helper)',
      status: 'ACTIVE',
    },
  });

  // Human Delegate Rules
  await prisma.policyRule.createMany({
    data: [
      {
        credentialId: humanCred.id,
        ruleType: 'SPEND_CAP_PER_TX',
        params: { limit: 200000 }, // ₦2,000 cap
      },
      {
        credentialId: humanCred.id,
        ruleType: 'BILLER_ALLOWLIST',
        params: { billerIds: [ikeja.id] },
      },
      {
        credentialId: humanCred.id,
        ruleType: 'CHANNEL_SCOPE',
        params: { channels: ['WEB'] },
      },
    ],
  });

  console.log('Seeded AI Agent and Human Delegate Credentials and Rules');

  // 5. Seed Historical Transaction Data
  // Seed dates: 30 days ago, 20 days ago, 10 days ago, and 5 days ago
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d20 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  const d10 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const d5 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const history = [
    { date: d30, amount: 500000, billerId: ikeja.id, token: '9847 2841 0938 1238 9043', ref: 'ref_seed_1' },
    { date: d20, amount: 500000, billerId: ikeja.id, token: '1092 3847 1827 3847 2984', ref: 'ref_seed_2' },
    { date: d10, amount: 500000, billerId: ikeja.id, token: '3829 4810 2938 4812 3901', ref: 'ref_seed_3' },
    { date: d5, amount: 100000, billerId: mtn.id, token: null, ref: 'ref_seed_4' },
  ];

  console.log('Seeding historical intents and audit events...');

  for (const item of history) {
    const intent = await prisma.paymentIntent.create({
      data: {
        credentialId: agentCred.id,
        channel: 'VOICE',
        billerId: item.billerId,
        amount: item.amount,
        status: 'EXECUTED',
        idempotencyKey: `VOICE:session_seed:${item.ref}`,
        createdAt: item.date,
      },
    });

    await prisma.policyDecision.create({
      data: {
        intentId: intent.id,
        verdict: 'ALLOW',
        reasons: [],
        evaluatedAt: item.date,
      },
    });

    await prisma.transaction.create({
      data: {
        intentId: intent.id,
        providerRef: item.ref,
        tokenEncrypted: item.token ? encryptToken(item.token) : null,
        executedAt: item.date,
      },
    });

    await prisma.auditEvent.create({
      data: {
        accountId: account.id,
        actor: 'AI_AGENT',
        eventType: 'payment.executed',
        payload: {
          intentId: intent.id,
          amount: item.amount,
          providerRef: item.ref,
        },
        createdAt: item.date,
      },
    });
  }

  // 6. Pre-seed the calculated Habit summary for Ikeja Electric
  // Three payments of ₦5,000 spaced exactly 10 days apart.
  // typicalAmountMean: 500000, amountVar: 0, typicalIntervalDays: 10
  await prisma.habit.create({
    data: {
      accountId: account.id,
      billerId: ikeja.id,
      typicalAmountMean: 500000,
      amountVar: 0,
      typicalIntervalDays: 10,
      lastPaidAt: d10,
    },
  });

  // Habit for MTN Airtime (1 payment, interval null, variance 0)
  await prisma.habit.create({
    data: {
      accountId: account.id,
      billerId: mtn.id,
      typicalAmountMean: 100000,
      amountVar: 0,
      typicalIntervalDays: null,
      lastPaidAt: d5,
    },
  });

  console.log('Pre-populated rolling Habits baseline data successfully.');
  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
