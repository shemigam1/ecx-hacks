import { IntentEvents } from '../contracts';
import { WebGateway } from './web.gateway';

function gatewayWithMockServer() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const gw = new WebGateway();
  (gw as any).server = { to, emit: jest.fn() };
  return { gw, to, emit };
}

describe('WebGateway room scoping (gap #11)', () => {
  it('escalated events go to the owning account room AND the demo room, not globally', () => {
    const { gw, to, emit } = gatewayWithMockServer();
    gw.onEscalated({ accountId: 'acct-1', intentId: 'i1', amount: 700000, reasons: [] } as any);
    expect(to).toHaveBeenCalledWith('account:acct-1');
    expect(to).toHaveBeenCalledWith('demo');
    expect(emit).toHaveBeenCalledTimes(2); // both rooms, no global broadcast
    expect((gw as any).server.emit).not.toHaveBeenCalled();
  });

  it('executed events are scoped to the account room', () => {
    const { gw, to } = gatewayWithMockServer();
    gw.onExecuted({ accountId: 'acct-2', intentId: 'i2', amount: 500000, executedAt: '' } as any);
    expect(to).toHaveBeenCalledWith('account:acct-2');
  });

  it('payloads without accountId (voided) go to the demo room only', () => {
    const { gw, to } = gatewayWithMockServer();
    gw.onVoided({ intentId: 'i3', reason: 'cosign denied' } as any);
    expect(to).toHaveBeenCalledWith('demo');
    expect(to).not.toHaveBeenCalledWith(expect.stringContaining('account:'));
  });

  it('subscribe joins the account room; demo room only when opted in', () => {
    const { gw } = gatewayWithMockServer();
    const client = { join: jest.fn() } as any;
    gw.onSubscribe(client, { accountId: 'acct-9' });
    expect(client.join).toHaveBeenCalledWith('account:acct-9');
    expect(client.join).not.toHaveBeenCalledWith('demo');
    gw.onSubscribe(client, { accountId: 'acct-9', demo: true });
    expect(client.join).toHaveBeenCalledWith('demo');
  });

  it('disconnects a handshake with no/invalid key', () => {
    const { gw } = gatewayWithMockServer();
    const client = { handshake: { auth: {}, query: {} }, emit: jest.fn(), disconnect: jest.fn() } as any;
    gw.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});

// keep the IntentEvents import used (documents which event names are scoped)
void IntentEvents;
