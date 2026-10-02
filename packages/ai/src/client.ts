// The only way ShipItLoud talks to Claude. Every call:
//   1. checks the monthly budget (worst-case estimate) BEFORE calling,
//   2. uses structured outputs so results are always valid JSON for our schema,
//   3. records real tokens and cost in the ledger afterwards.
// AI_MODE=mock (or no ANTHROPIC_API_KEY) returns the caller's mock instead, so tests never spend money.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

// USD per million tokens. Cache reads bill at 0.1x input, cache writes at 1.25x.
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

/** Fast model for drafts, scoring, classification (PRD: Haiku 4.5). */
export const fastModel = () => process.env.AI_MODEL_FAST || 'claude-haiku-4-5';
/** Model for brand brain, long-form, final QA (PRD: a Sonnet model). Defaults to Haiku while the budget is tiny. */
export const smartModel = () => process.env.AI_MODEL_SMART || 'claude-haiku-4-5';
export const monthlyBudget = () => Number(process.env.AI_MONTHLY_BUDGET_USD ?? '1');

export class BudgetExceededError extends Error {
  spent: number;
  budget: number;
  constructor(spent: number, budget: number) {
    super(`AI budget reached: $${spent.toFixed(2)} of $${budget.toFixed(2)} this month`);
    this.spent = spent;
    this.budget = budget;
  }
}

export interface LedgerRow {
  workspace_id: string | null;
  purpose: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  ok: boolean;
  error?: string;
}

export interface Ledger {
  spentThisMonth(): Promise<number>;
  record(row: LedgerRow): Promise<void>;
}

export function costOf(model: string, u: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!; // unknown model: assume the dearest so the cap stays safe
  return (u.input * p.input + (u.cacheRead ?? 0) * p.input * 0.1 + (u.cacheWrite ?? 0) * p.input * 1.25 + u.output * p.output) / 1_000_000;
}

/** Rough token count (about 3.5 characters per token) for the pre-call worst-case estimate. */
export const approxTokens = (s: string) => Math.ceil(s.length / 3.5);

export const isMock = () => process.env.AI_MODE === 'mock' || !process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 }));

export interface GenerateArgs<S extends z.ZodType> {
  ledger: Ledger;
  purpose: string;
  promptVersion: string;
  workspaceId: string | null;
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  /** Returned in mock mode. Must satisfy the schema. */
  mock: () => z.infer<S>;
}

export interface GenerateResult<T> {
  data: T;
  costUsd: number;
  model: string;
  mocked: boolean;
}

export async function generate<S extends z.ZodType>(a: GenerateArgs<S>): Promise<GenerateResult<z.infer<S>>> {
  if (isMock()) return { data: a.schema.parse(a.mock()), costUsd: 0, model: 'mock', mocked: true };

  const budget = monthlyBudget();
  const spent = await a.ledger.spentThisMonth();
  const worstCase = costOf(a.model, { input: approxTokens(a.system + a.user) + 300, output: a.maxTokens });
  if (spent + worstCase > budget) throw new BudgetExceededError(spent, budget);

  const base = { workspace_id: a.workspaceId, purpose: a.purpose, model: a.model, prompt_version: a.promptVersion };
  try {
    const res = await anthropic().messages.parse({
      model: a.model,
      max_tokens: a.maxTokens,
      // Stable system prompt first and cached; the per-request content goes in the user turn.
      system: [{ type: 'text', text: a.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: a.user }],
      output_config: { format: zodOutputFormat(a.schema) },
    });
    const u = res.usage;
    const usage = { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
    const cost = costOf(a.model, usage);
    await a.ledger.record({ ...base, input_tokens: usage.input, output_tokens: usage.output, cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite, cost_usd: cost, ok: true });

    if (res.stop_reason === 'refusal') throw new Error('The model declined this request');
    if (res.stop_reason === 'max_tokens') throw new Error('Response was cut off (max_tokens)');
    if (!res.parsed_output) throw new Error('Model returned output that did not match the schema');
    return { data: res.parsed_output as z.infer<S>, costUsd: cost, model: a.model, mocked: false };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      await a.ledger.record({ ...base, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0, ok: false, error: `${err.status}: ${err.message}`.slice(0, 500) });
      if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic API key is invalid');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Anthropic rate limit: try again shortly');
      if (err.status === 400 && /credit balance/i.test(err.message)) throw new Error('Anthropic account is out of credit');
    }
    throw err;
  }
}
