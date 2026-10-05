export type ToolContext = {
  userId: string;
  repositoryId: string;
};

export type ToolParamSpec = {
  type: 'string' | 'number';
  description: string;
  required: boolean;
};

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, ToolParamSpec>;
  execute: (
    ctx: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}
