import type { AgentReply } from '../agent/agent.service';
import { FakeSttProvider } from './fake-stt.provider';
import { VoiceController } from './voice.controller';

function make(agentReply: AgentReply, transcript = 'buy me light') {
  const agent = {
    handleMessage: jest.fn().mockResolvedValue(agentReply),
    resolveContext: jest.fn().mockResolvedValue({ sessionId: 's', channel: 'VOICE', userId: 'u', accountId: 'a', credentialId: 'c', reauthOk: false }),
  };
  const stt = new FakeSttProvider(transcript);
  // Stateful auth stub: '0000' passes; three wrong attempts lock.
  let attempts = 0;
  const auth = {
    verifyPin: jest.fn(async (_userId: string, pin: string) => {
      if (pin === '0000') { attempts = 0; return { ok: true, locked: false }; }
      attempts += 1;
      return { ok: false, locked: attempts >= 3 };
    }),
  };
  // In-memory SessionStore fake so state persists across webhook calls within a test.
  const mem = new Map<string, unknown>();
  const store = {
    load: jest.fn(async (id: string) => mem.get(id) ?? null),
    save: jest.fn(async (id: string, _u: string, _c: string, state: unknown) => { mem.set(id, JSON.parse(JSON.stringify(state))); }),
    delete: jest.fn(async (id: string) => { mem.delete(id); }),
  };
  return { ctrl: new VoiceController(agent as any, stt, auth as any, store as any), agent };
}

const NO_PAYMENT: AgentReply = { reply: 'Five thousand naira for Ikeja Electric?', toolTrace: [] };
const EXECUTED: AgentReply = {
  reply: 'Done. Here is your token.',
  toolTrace: [{ name: 'initiate_payment', arguments: {}, result: { verdict: 'ALLOW', status: 'EXECUTED', token: '1234 5678 9012 3456 7890' } }],
};

describe('VoiceController', () => {
  it('incoming greets and asks for the PIN via DTMF', async () => {
    const { ctrl } = make(NO_PAYMENT);
    const xml = await ctrl.incoming({ sessionId: 's1', callerNumber: '+2348030000001' });
    expect(xml).toContain('<GetDigits');
    expect(xml).toContain('/voice/pin?k=');
    expect(xml).toContain('PIN');
  });

  it('correct PIN moves to recording the intent', async () => {
    const { ctrl } = make(NO_PAYMENT);
    await ctrl.incoming({ sessionId: 's1' });
    const xml = await ctrl.pin({ sessionId: 's1', dtmfDigits: '0000' });
    expect(xml).toContain('<Record');
    expect(xml).toContain('/voice/intent?k=');
  });

  it('locks the channel after 3 wrong PINs', async () => {
    const { ctrl } = make(NO_PAYMENT);
    await ctrl.incoming({ sessionId: 's2' });
    await ctrl.pin({ sessionId: 's2', dtmfDigits: '9999' });
    await ctrl.pin({ sessionId: 's2', dtmfDigits: '9999' });
    const xml = await ctrl.pin({ sessionId: 's2', dtmfDigits: '9999' });
    expect(xml).toContain('<Hangup');
  });

  it('a confirmation-seeking agent reply becomes a DTMF confirm prompt', async () => {
    const { ctrl } = make(NO_PAYMENT);
    await ctrl.incoming({ sessionId: 's3' });
    await ctrl.pin({ sessionId: 's3', dtmfDigits: '0000' });
    const xml = await ctrl.intent({ sessionId: 's3', recordingUrl: 'http://rec' });
    expect(xml).toContain('/voice/confirm?k=');
    expect(xml).toContain('Press 1 to confirm');
  });

  it('an EXECUTED payment reads the token back digit-by-digit', async () => {
    const { ctrl } = make(EXECUTED);
    await ctrl.incoming({ sessionId: 's4' });
    await ctrl.pin({ sessionId: 's4', dtmfDigits: '0000' });
    const xml = await ctrl.intent({ sessionId: 's4', recordingUrl: 'http://rec' });
    expect(xml).toContain('1 2 3 4, 5 6 7 8, 9 0 1 2, 3 4 5 6, 7 8 9 0');
    expect(xml).toContain('/voice/repeat?k=');
  });

  it('requires PIN before accepting an intent', async () => {
    const { ctrl } = make(NO_PAYMENT);
    await ctrl.incoming({ sessionId: 's5' });
    const xml = await ctrl.intent({ sessionId: 's5', recordingUrl: 'http://rec' });
    expect(xml).toContain('<Hangup');
  });
});
