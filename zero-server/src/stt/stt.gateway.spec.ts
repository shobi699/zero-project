import { Test, TestingModule } from '@nestjs/testing';
import { SttGateway } from './stt.gateway';
import { JwtService } from '@nestjs/jwt';
import { QuotaService } from '../quota/quota.service';
import { SttService } from './stt.service';

describe('SttGateway', () => {
  let gateway: SttGateway;
  let jwtService: jest.Mocked<JwtService>;
  let quotaService: jest.Mocked<QuotaService>;
  let sttService: jest.Mocked<SttService>;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';

    const mockJwtService = {
      verify: jest.fn(),
    };
    const mockQuotaService = {
      checkQuota: jest.fn(),
      consumeQuota: jest.fn(),
    };
    const mockSttService = {
      transcribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SttGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: SttService, useValue: mockSttService },
      ],
    }).compile();

    gateway = module.get<SttGateway>(SttGateway);
    jwtService = module.get(JwtService) as any;
    quotaService = module.get(QuotaService) as any;
    sttService = module.get(SttService) as any;
  });

  const createMockWebSocket = () => {
    return {
      close: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      readyState: 1, // WebSocket.OPEN
    } as any;
  };

  const createMockRequest = (url?: string, authHeader?: string) => {
    return {
      url: url || '',
      headers: {
        authorization: authHeader,
      },
    } as any;
  };

  it('should reject connection when no token is provided (4001)', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt');

    await gateway.handleConnection(client, req);

    expect(client.close).toHaveBeenCalledWith(4001);
  });

  it('should reject connection when token is invalid (4002)', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=invalid-token');
    
    jwtService.verify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    await gateway.handleConnection(client, req);

    expect(client.close).toHaveBeenCalledWith(4002);
  });

  it('should reject connection when quota is exhausted (4003)', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=valid-token');
    
    jwtService.verify.mockReturnValue({ sub: 'user1' });
    quotaService.checkQuota.mockResolvedValue(false);

    await gateway.handleConnection(client, req);

    expect(client.close).toHaveBeenCalledWith(4003);
  });

  it('should accept connection when token and quota are valid', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=valid-token');
    
    jwtService.verify.mockReturnValue({ sub: 'user1' });
    quotaService.checkQuota.mockResolvedValue(true);

    await gateway.handleConnection(client, req);

    expect(client.close).not.toHaveBeenCalled();
    expect(client.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should reject binary audio without start message', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=valid-token');
    
    jwtService.verify.mockReturnValue({ sub: 'user1' });
    quotaService.checkQuota.mockResolvedValue(true);

    await gateway.handleConnection(client, req);
    
    const messageHandler = client.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
    
    const binaryData = Buffer.alloc(100);
    await messageHandler(binaryData, true);
    
    expect(client.send).not.toHaveBeenCalled();
  });

  it('should enforce 5-minute maximum PCM buffer size limit (4004)', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=valid-token');
    
    jwtService.verify.mockReturnValue({ sub: 'user1' });
    quotaService.checkQuota.mockResolvedValue(true);

    await gateway.handleConnection(client, req);
    
    const messageHandler = client.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
    
    await messageHandler(Buffer.from(JSON.stringify({ type: 'start' })), false);
    
    const oversizeChunk = Buffer.alloc(9600001);
    await messageHandler(oversizeChunk, true);
    
    expect(client.close).toHaveBeenCalledWith(4004);
  });

  it('should successfully pipeline start -> binary -> stop -> transcribe -> consume quota', async () => {
    const client = createMockWebSocket();
    const req = createMockRequest('/stt?token=valid-token');
    
    jwtService.verify.mockReturnValue({ sub: 'user1' });
    quotaService.checkQuota.mockResolvedValue(true);
    sttService.transcribe.mockResolvedValue('سلام دنیا');

    await gateway.handleConnection(client, req);
    
    const messageHandler = client.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];
    
    await messageHandler(Buffer.from(JSON.stringify({ type: 'start' })), false);
    
    const audioChunk = Buffer.alloc(32000);
    await messageHandler(audioChunk, true);
    
    await messageHandler(Buffer.from(JSON.stringify({ type: 'stop' })), false);
    
    expect(sttService.transcribe).toHaveBeenCalledWith(
      expect.any(Buffer),
      16000,
      1,
      'fa',
      'user1'
    );
    
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'final', text: 'سلام دنیا' })
    );
    
    expect(quotaService.consumeQuota).toHaveBeenCalledWith('user1', 1);
  });
});
