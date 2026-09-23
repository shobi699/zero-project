import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly openaiUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(private readonly prisma: PrismaService) {}

  async summarize(userId: string, text: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isPro = user?.subscription === 'smart';
    if (!isPro) {
      throw new HttpException('این قابلیت ویژه کاربران پرو می‌باشد', HttpStatus.PAYMENT_REQUIRED);
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const response = await axios.post(
        this.openaiUrl,
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that summarizes long meetings. Output a professional Persian summary with bullet points for key takeaways.',
            },
            {
              role: 'user',
              content: text,
            },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      this.logger.error('Failed to summarize text', error.response?.data || error.message);
      throw new HttpException('خطا در ارتباط با سرور هوش مصنوعی', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async polish(userId: string, text: string, mode: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isPro = user?.subscription === 'smart';
    if (!isPro) {
      throw new HttpException('این قابلیت ویژه کاربران پرو می‌باشد', HttpStatus.PAYMENT_REQUIRED);
    }

    let systemPrompt = '';
    switch (mode) {
      case 'grammar':
        systemPrompt = 'شما یک دستیار هوش مصنوعی هستید. متن زیر را از نظر نگارشی و املایی تصحیح کنید. فقط متن تصحیح شده را بدون هیچ توضیح اضافه‌ای برگردانید.';
        break;
      case 'formal':
        systemPrompt = 'شما یک دستیار هوش مصنوعی هستید. متن زیر را به یک متن کاملا رسمی و اداری به زبان فارسی تبدیل کنید. فقط متن نهایی را بدون هیچ توضیح اضافه‌ای برگردانید.';
        break;
      case 'informal':
        systemPrompt = 'شما یک دستیار هوش مصنوعی هستید. متن زیر را به یک متن دوستانه، محاوره‌ای و غیررسمی به زبان فارسی تبدیل کنید. فقط متن نهایی را بدون هیچ توضیح اضافه‌ای برگردانید.';
        break;
      default:
        return text;
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const response = await axios.post(
        this.openaiUrl,
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: text,
            },
          ],
          temperature: 0.3, // Lower temperature for editing
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      this.logger.error('Failed to polish text', error.response?.data || error.message);
      throw new HttpException('خطا در ارتباط با سرور هوش مصنوعی', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
