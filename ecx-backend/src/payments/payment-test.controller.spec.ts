import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTestController } from './payment-test.controller';

describe('PaymentTestController', () => {
  let controller: PaymentTestController;
  let orchestrator: any;

  const mockOrchestrator = {
    initiatePayment: jest.fn(),
    requeryIntent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTestController],
      providers: [
        {
          provide: 'PaymentOrchestrator',
          useValue: mockOrchestrator,
        },
      ],
    }).compile();

    controller = module.get<PaymentTestController>(PaymentTestController);
    orchestrator = module.get('PaymentOrchestrator');
  });

  it('should call paymentOrchestrator.initiatePayment with input and return result', async () => {
    const input = {
      credentialId: 'cred_123',
      channel: 'WEB' as const,
      amount: 5000,
      idempotencyKey: 'key_123',
    };

    const mockResult = {
      intent: { id: 'intent_123' },
      decision: { verdict: 'ALLOW' },
    };

    mockOrchestrator.initiatePayment.mockResolvedValue(mockResult);

    const result = await controller.initiate(input);

    expect(orchestrator.initiatePayment).toHaveBeenCalledWith(input);
    expect(result).toEqual(mockResult);
  });

  it('should call paymentOrchestrator.requeryIntent with id and return result', async () => {
    const mockResult = {
      intent: { id: 'intent_123', status: 'EXECUTED' },
    };

    mockOrchestrator.requeryIntent.mockResolvedValue(mockResult);

    const result = await controller.getStatus('intent_123');

    expect(orchestrator.requeryIntent).toHaveBeenCalledWith('intent_123');
    expect(result).toEqual(mockResult);
  });
});
