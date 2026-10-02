import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiLlmService } from './gemini-llm.service';

describe('GeminiLlmService', () => {
  let service: GeminiLlmService;
  const getOrThrow = jest.fn();
  const get = jest.fn();

  const realFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    getOrThrow.mockReturnValue('test-key');
    get.mockImplementation((key: string) =>
      key === 'llm.model'
        ? 'gemini-2.5-flash'
        : key === 'llm.timeoutMs'
          ? 60000
          : undefined,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiLlmService,
        {
          provide: ConfigService,
          useValue: { getOrThrow, get },
        },
      ],
    }).compile();

    service = module.get<GeminiLlmService>(GeminiLlmService);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(response: {
    ok?: boolean;
    status?: number;
    jsonBody?: unknown;
  }) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.jsonBody ?? {}),
    });
  }

  it('sends the key as a header and returns joined text', async () => {
    mockFetch({
      jsonBody: {
        candidates: [
          { content: { parts: [{ text: 'Hello ' }, { text: 'world' }] } },
        ],
      },
    });

    const result = await service.complete('hi');

    expect(result).toBe('Hello world');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const sentBody = init.body as string;
    expect(sentBody).not.toContain('test-key');
  });

  it('maps 401/403 to Unauthorized', async () => {
    mockFetch({ ok: false, status: 401 });
    await expect(service.complete('hi')).rejects.toThrow(UnauthorizedException);

    mockFetch({ ok: false, status: 403 });
    await expect(service.complete('hi')).rejects.toThrow(UnauthorizedException);
  });

  it('maps 429 to rate-limited BadGateway', async () => {
    mockFetch({ ok: false, status: 429 });
    await expect(service.complete('hi')).rejects.toThrow(/rate limited/);
  });

  it('throws when candidates carry no text', async () => {
    mockFetch({ jsonBody: { candidates: [] } });
    await expect(service.complete('hi')).rejects.toThrow(BadGatewayException);

    mockFetch({ jsonBody: {} });
    await expect(service.complete('hi')).rejects.toThrow(BadGatewayException);
  });
});
