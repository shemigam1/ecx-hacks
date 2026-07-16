import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTestController } from './payment-test.controller';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('PaymentTestController', () => {
  let app: INestApplication;
  let orchestrator: any;

  const mockOrchestrator = {
    initiatePayment: jest.fn(),
    requeryIntent: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTestController],
      providers: [
        {
          provide: 'PaymentOrchestrator',
          useValue: mockOrchestrator,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    orchestrator = moduleFixture.get('PaymentOrchestrator');
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects initiate payment with missing credentialId (400)', async () => {
    await request(app.getHttpServer())
      .post('/payments/initiate')
      .send({
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_123',
      })
      .expect(400);
  });

  it('rejects initiate payment with non-positive amount (400)', async () => {
    await request(app.getHttpServer())
      .post('/payments/initiate')
      .send({
        credentialId: 'cred_123',
        channel: 'WEB',
        amount: 0,
        idempotencyKey: 'key_123',
      })
      .expect(400);
  });

  it('rejects initiate payment with negative amount (400)', async () => {
    await request(app.getHttpServer())
      .post('/payments/initiate')
      .send({
        credentialId: 'cred_123',
        channel: 'WEB',
        amount: -100,
        idempotencyKey: 'key_123',
      })
      .expect(400);
  });

  it('accepts valid input and passes to orchestrator', async () => {
    const mockResult = {
      intent: { id: 'intent_123' },
      decision: { verdict: 'ALLOW' },
    };
    mockOrchestrator.initiatePayment.mockResolvedValue(mockResult);

    await request(app.getHttpServer())
      .post('/payments/initiate')
      .send({
        credentialId: 'cred_123',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_123',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual(mockResult);
      });

    expect(orchestrator.initiatePayment).toHaveBeenCalled();
  });

  it('should call paymentOrchestrator.requeryIntent with id and return result', async () => {
    const mockResult = {
      intent: { id: 'intent_123', status: 'EXECUTED' },
    };

    mockOrchestrator.requeryIntent.mockResolvedValue(mockResult);

    await request(app.getHttpServer())
      .get('/payments/intent_123')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(mockResult);
      });

    expect(orchestrator.requeryIntent).toHaveBeenCalledWith('intent_123');
  });
});
