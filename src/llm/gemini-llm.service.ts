import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

const GENERATE_PATH = 'v1beta/models';
const DEFAULT_TIMEOUT_MS = 60_000;

export type GeminiGenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

@Injectable()
export class GeminiLlmService implements LlmService {
  private readonly logger = new Logger(GeminiLlmService.name);

  constructor(private readonly config: ConfigService) {}

  async complete(prompt: string): Promise<string> {
    const apiKey = this.config.getOrThrow<string>('llm.apiKey');
    const model = this.config.get<string>('llm.model') ?? 'gemini-2.5-flash';
    const timeoutMs =
      this.config.get<number>('llm.timeoutMs') ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/${GENERATE_PATH}/${model}:generateContent`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
            'User-Agent': 'WhyCODE',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new BadGatewayException('LLM request timed out');
      }
      this.logger.error('LLM network error');
      throw new BadGatewayException('LLM unreachable');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400) {
      throw new BadGatewayException('LLM rejected the request');
    }
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid LLM key');
    }
    if (res.status === 429) {
      throw new BadGatewayException('LLM rate limited, retry later');
    }
    if (!res.ok) {
      this.logger.warn(`LLM generateContent -> ${res.status}`);
      throw new BadGatewayException('LLM request failed');
    }
    const data = (await res.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('');
    if (!text) throw new BadGatewayException('LLM returned no content');
    return text;
  }
}
