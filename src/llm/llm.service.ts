export const LLM_SERVICE = Symbol('LlmService');

export interface LlmService {
  complete(prompt: string): Promise<string>;
}
