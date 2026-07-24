import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

import type { ModelPricing } from './costs.js';
import { buildOpenAiRequestParams } from './providers/openai.js';
import type { AiExtractionRequest } from './providers/types.js';

export class AiBudgetPolicyError extends Error {}

export class UnknownAiModelPricingError extends AiBudgetPolicyError {
  constructor() {
    super('Scheduled AI cannot run because model pricing is unavailable');
    this.name = 'UnknownAiModelPricingError';
  }
}

export class AiBudgetExceededError extends AiBudgetPolicyError {
  constructor() {
    super('Scheduled AI monthly budget has insufficient remaining capacity');
    this.name = 'AiBudgetExceededError';
  }
}

export class UnsupportedAiModelEncodingError extends AiBudgetPolicyError {
  constructor(model: string) {
    super(`Scheduled AI cannot run because tokenizer support is unavailable for model: ${model}`);
    this.name = 'UnsupportedAiModelEncodingError';
  }
}

export class AiBudgetInvariantError extends AiBudgetPolicyError {
  constructor(reason = 'Provider usage violated the reserved budget upper bound') {
    super(reason);
    this.name = 'AiBudgetInvariantError';
  }
}

/**
 * Conservative allowance for Responses API message and structured-output framing
 * that is added by the service outside the locally serialized request object.
 * Reconciliation enforces that reported input usage never exceeds the reservation.
 */
export const OPENAI_RESPONSES_FRAMING_ALLOWANCE_TOKENS = 32;

export interface AiBudgetReservationView {
  id: string;
  reservedCostUsd: number;
  billingMonth: string;
}

interface ReserveAiBudgetInput {
  dispatchIntentId: string;
  scheduleId: string;
  requestKey: string;
  ownerToken: string;
  model: string;
  pricing: ModelPricing | null;
  promptTokens: number;
  maxOutputTokens: number;
  monthlyBudgetUsd: number;
  now?: Date;
}

function billingMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** Resolve only tokenizer families whose mapping is explicitly supported by this application. */
export function resolveOpenAiTokenizerModel(model: string): 'gpt-5' {
  if (/^gpt-5(?:\.4)?(?:-(?:mini|nano))?$/.test(model)) return 'gpt-5';
  throw new UnsupportedAiModelEncodingError(model);
}

/**
 * Counts the complete locally serialized request using the selected model's
 * tokenizer, then adds a documented conservative service-framing allowance.
 */
export async function countAiPromptTokens(
  request: AiExtractionRequest,
  model: string,
  flexProcessing: boolean,
): Promise<number> {
  const { encodingForModel } = await import('js-tiktoken');
  const encoding = encodingForModel(resolveOpenAiTokenizerModel(model));
  const params = await buildOpenAiRequestParams(request, model, flexProcessing);
  return encoding.encode(JSON.stringify(params)).length + OPENAI_RESPONSES_FRAMING_ALLOWANCE_TOKENS;
}

export function reserveAiBudget(
  sqlite: Database.Database,
  input: ReserveAiBudgetInput,
): AiBudgetReservationView {
  if (!input.pricing) throw new UnknownAiModelPricingError();
  const now = input.now ?? new Date();
  const month = billingMonth(now);
  const reservedCostUsd =
    input.promptTokens * input.pricing.inputPerToken +
    input.maxOutputTokens * input.pricing.outputPerToken;
  if (
    input.promptTokens < 0 ||
    input.maxOutputTokens <= 0 ||
    input.monthlyBudgetUsd <= 0 ||
    !Number.isFinite(reservedCostUsd)
  ) {
    throw new AiBudgetExceededError();
  }

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const existing = sqlite
      .prepare(
        `SELECT id, reserved_cost_usd AS reservedCostUsd, billing_month AS billingMonth
         FROM ai_budget_reservation WHERE request_key = ?`,
      )
      .get(input.requestKey) as AiBudgetReservationView | undefined;
    if (existing) {
      sqlite.exec('COMMIT');
      return existing;
    }
    const spend = sqlite
      .prepare(
        `SELECT COALESCE(SUM(
          CASE WHEN status = 'reserved' THEN reserved_cost_usd ELSE actual_cost_usd END
        ), 0) AS spent
         FROM ai_budget_reservation
         WHERE schedule_id = ? AND billing_month = ?`,
      )
      .get(input.scheduleId, month) as { spent: number };
    if (spend.spent + reservedCostUsd > input.monthlyBudgetUsd + Number.EPSILON) {
      throw new AiBudgetExceededError();
    }

    const id = nanoid();
    sqlite
      .prepare(
        `INSERT INTO ai_budget_reservation (
          id, dispatch_intent_id, schedule_id, request_key, owner_token,
          billing_month, model, prompt_tokens, max_output_tokens,
          input_per_token, output_per_token, reserved_cost_usd,
          actual_cost_usd, status, reserved_at, reconciled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', ?, NULL)`,
      )
      .run(
        id,
        input.dispatchIntentId,
        input.scheduleId,
        input.requestKey,
        input.ownerToken,
        month,
        input.model,
        input.promptTokens,
        input.maxOutputTokens,
        input.pricing.inputPerToken,
        input.pricing.outputPerToken,
        reservedCostUsd,
        now.toISOString(),
      );
    sqlite.exec('COMMIT');
    return { id, reservedCostUsd, billingMonth: month };
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

export function reconcileAiBudgetReservation(
  sqlite: Database.Database,
  id: string,
  usage: { promptTokens: number; completionTokens: number; now?: Date },
): boolean {
  const nowIso = (usage.now ?? new Date()).toISOString();
  let invariantError: AiBudgetInvariantError | undefined;
  let reconciled = false;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const row = sqlite
      .prepare(
        `SELECT prompt_tokens AS promptTokens, max_output_tokens AS maxOutputTokens,
                input_per_token AS inputPerToken, output_per_token AS outputPerToken,
                reserved_cost_usd AS reservedCostUsd
         FROM ai_budget_reservation WHERE id = ? AND status = 'reserved'`,
      )
      .get(id) as
      | {
          promptTokens: number;
          maxOutputTokens: number;
          inputPerToken: number;
          outputPerToken: number;
          reservedCostUsd: number;
        }
      | undefined;
    if (!row) {
      sqlite.exec('COMMIT');
      return false;
    }
    const validUsage =
      Number.isFinite(usage.promptTokens) &&
      Number.isInteger(usage.promptTokens) &&
      usage.promptTokens >= 0 &&
      Number.isFinite(usage.completionTokens) &&
      Number.isInteger(usage.completionTokens) &&
      usage.completionTokens >= 0;
    if (!validUsage) {
      invariantError = new AiBudgetInvariantError(
        'Provider usage tokens must be finite non-negative integers',
      );
      sqlite.exec('COMMIT');
    } else {
      const actualCostUsd =
        usage.promptTokens * row.inputPerToken + usage.completionTokens * row.outputPerToken;
      const floatingTolerance =
        Number.EPSILON *
        Math.max(Math.abs(actualCostUsd), Math.abs(row.reservedCostUsd), Number.MIN_VALUE) *
        8;
      if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0) {
        invariantError = new AiBudgetInvariantError(
          'Computed actual cost must be finite and non-negative',
        );
        sqlite.exec('COMMIT');
      } else if (
        usage.promptTokens > row.promptTokens ||
        usage.completionTokens > row.maxOutputTokens ||
        actualCostUsd > row.reservedCostUsd + floatingTolerance
      ) {
        sqlite
          .prepare(
            `UPDATE ai_budget_reservation
             SET reserved_cost_usd = MAX(reserved_cost_usd, ?)
             WHERE id = ? AND status = 'reserved'`,
          )
          .run(actualCostUsd, id);
        invariantError =
          usage.promptTokens > row.promptTokens
            ? new AiBudgetInvariantError(
                'Actual prompt usage exceeded the reserved prompt-token upper bound',
              )
            : usage.completionTokens > row.maxOutputTokens
              ? new AiBudgetInvariantError(
                  'Actual completion usage exceeded the configured output-token upper bound',
                )
              : new AiBudgetInvariantError(
                  'Computed actual cost exceeded the reserved cost upper bound',
                );
        sqlite.exec('COMMIT');
      } else {
        const updated = sqlite
          .prepare(
            `UPDATE ai_budget_reservation
             SET status = 'reconciled', actual_cost_usd = ?, reconciled_at = ?
             WHERE id = ? AND status = 'reserved'`,
          )
          .run(actualCostUsd, nowIso, id);
        sqlite.exec('COMMIT');
        reconciled = updated.changes === 1;
      }
    }
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  if (invariantError) throw invariantError;
  return reconciled;
}

export function abandonAiReservations(
  sqlite: Database.Database,
  input: { dispatchIntentId: string; currentOwnerToken: string; now?: Date },
): number {
  const result = sqlite
    .prepare(
      `UPDATE ai_budget_reservation
       SET status = 'abandoned', actual_cost_usd = reserved_cost_usd, reconciled_at = ?
       WHERE dispatch_intent_id = ? AND status = 'reserved' AND owner_token != ?`,
    )
    .run((input.now ?? new Date()).toISOString(), input.dispatchIntentId, input.currentOwnerToken);
  return result.changes;
}
