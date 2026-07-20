import { WebSocketGateway, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import * as WebSocket from 'ws';
import { JwtService } from '@nestjs/jwt';
import { QuotaService } from '../quota/quota.service';
import { SttService } from './stt.service';
import { Logger } from '@nestjs/common';
import * as url from 'url';

interface SessionData {
  userId: string;
  buffer: Buffer;
  config: {
    sampleRate: number;
    channels: number;
    language: string;
  };
  isActive: boolean;
}

@WebSocketGateway({
  path: '/stt',
})
export class SttGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SttGateway.name);
  private sessions = new Map<WebSocket, SessionData>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly quotaService: QuotaService,
    private readonly sttService: SttService,
  ) {}

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    this.logger.log('New WebSocket connection attempt');
    
    try {
      const parsedUrl = url.parse(req.url || '', true);
      const token = (parsedUrl.query.token as string) || req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        this.sendError(client, 'توکن امنیتی یافت نشد. لطفا ابتدا وارد حساب خود شوید.');
        client.close(4001);
        return;
      }

      let payload: any;
      try {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET not configured');
        }
        payload = this.jwtService.verify(token, { secret });
      } catch (err: any) {
        this.logger.warn(`Connection rejected: Invalid token: ${err.message}`);
        this.sendError(client, 'نشست شما منقضی شده است. لطفا دوباره وارد شوید.');
        client.close(4002);
        return;
      }

      const userId = payload.sub;
      this.logger.log(`Authenticated connection for user: ${userId}`);

      // Check quota
      const hasQuota = await this.quotaService.checkQuota(userId);
      if (!hasQuota) {
        this.logger.warn(`Connection rejected: Quota exhausted for user: ${userId}`);
        this.sendError(client, 'سهمیه ابری ماه جاری شما به پایان رسیده است.');
        client.close(4003);
        return;
      }

      // Initialize session
      this.sessions.set(client, {
        userId,
        buffer: Buffer.alloc(0),
        config: {
          sampleRate: 16000,
          channels: 1,
          language: 'fa',
        },
        isActive: false,
      });

      // Bind message handler
      client.on('message', async (data: WebSocket.Data, isBinary: boolean) => {
        await this.handleClientMessage(client, data, isBinary);
      });

    } catch (e) {
      this.logger.error('Error during connection handling', e);
      client.close(1011);
    }
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected');
    this.sessions.delete(client);
  }

  private async handleClientMessage(client: WebSocket, data: WebSocket.Data, isBinary: boolean) {
    const session = this.sessions.get(client);
    if (!session) {
      return;
    }

    if (isBinary) {
      if (!session.isActive) {
        this.logger.warn('Received binary data before start message');
        return;
      }

      const chunk = Buffer.from(data as ArrayBuffer);
      
      // Limit total buffer duration to 5 minutes to prevent memory overflow
      // 16kHz mono 16-bit PCM = 32000 bytes/sec. 5 minutes = 300 * 32000 = 9,600,000 bytes.
      const maxSize = 300 * session.config.sampleRate * session.config.channels * 2;
      if (session.buffer.length + chunk.length > maxSize) {
        this.logger.warn(`Buffer size exceeded limit (5 min) for user ${session.userId}`);
        this.sendError(client, 'طول فایل صوتی از سقف مجاز (۵ دقیقه) بیشتر است.');
        client.close(4004);
        return;
      }

      session.buffer = Buffer.concat([session.buffer, chunk]);
      return;
    }

    // Text message
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'start') {
        session.isActive = true;
        session.buffer = Buffer.alloc(0);
        if (msg.config) {
          session.config.sampleRate = msg.config.sample_rate || 16000;
          session.config.channels = msg.config.channels || 1;
          session.config.language = msg.config.language || 'fa';
        }
        this.logger.log(`Recording started for user ${session.userId}: ${JSON.stringify(session.config)}`);
      } else if (msg.type === 'stop') {
        if (!session.isActive) {
          this.logger.warn('Received stop message without active recording');
          return;
        }

        session.isActive = false;
        this.logger.log(`Recording stopped. Total PCM bytes received: ${session.buffer.length}`);

        if (session.buffer.length === 0) {
          client.send(JSON.stringify({ type: 'final', text: '' }));
          return;
        }

        // Transcribe and compute quota
        try {
          const text = await this.sttService.transcribe(
            session.buffer,
            session.config.sampleRate,
            session.config.channels,
            session.config.language,
            session.userId,
          );

          // Success, send final text
          client.send(JSON.stringify({ type: 'final', text }));

          // Consume quota
          const durationSec = session.buffer.length / (session.config.sampleRate * session.config.channels * 2);
          await this.quotaService.consumeQuota(session.userId, durationSec);

        } catch (err: any) {
          this.logger.error(`Transcription failed: ${err.message}`);
          this.sendError(client, err.message || 'خطا در تبدیل گفتار به متن');
        }
      }
    } catch (err: any) {
      this.logger.error('Invalid text message format', err);
      this.sendError(client, 'فرمت پیام نامعتبر است');
    }
  }

  private sendError(client: WebSocket, message: string) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', message }));
    }
  }
}
