import { Module } from '@nestjs/common';
import { GeminiLlmService } from './gemini-llm.service';
import { LLM_SERVICE } from './llm.service';

@Module({
  providers: [{ provide: LLM_SERVICE, useClass: GeminiLlmService }],
  exports: [LLM_SERVICE],
})
export class LlmModule {}
