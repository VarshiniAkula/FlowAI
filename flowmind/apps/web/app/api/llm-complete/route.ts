import { GeminiError, mapUpstreamError } from '@/lib/gemini/errors';
import { LIMITS } from '@/lib/gemini/limits';
import { assertSameOrigin, errorResponse, jsonNoStore } from '@/lib/gemini/request';
import { requireUser } from '@/lib/auth/guards';
import { getGroqDemoConfig } from '@/lib/llm/config';
import { groqErrorToFallbackReason, GroqError } from '@/lib/llm/errors';
import { resolveLlmProvider } from '@/lib/llm/resolver';
import { geminiGenerate, geminiStreamAdapter } from '@/lib/llm/providers/gemini';
import { groqGenerate, groqStream } from '@/lib/llm/providers/groq';
import { chunkDeterministic, deterministicReply } from '@/lib/llm/providers/deterministic';
import { getGroqDemoUsage, recordGroqDemoResult, reserveGroqDemoRequest } from '@/lib/groq/usage';
import type { LlmFallbackReason } from '@/lib/llm/types';

export const runtime = 'nodejs';

interface Body {
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  stream?: boolean;
}

/**
 * POST /api/llm-complete — LLM completion for the test simulator's LLM Response
 * node. Provider precedence (see lib/llm/resolver):
 *
 *   1. Gemini BYOK   → real Gemini (user's own quota)
 *   2. Groq demo     → shared FlowMind allowance (authenticated + atomically capped)
 *   3. Platform Gemini → only when ALLOW_PLATFORM_GEMINI_LLM_FALLBACK === 'true'
 *   4. Simulation    → deterministic, clearly labeled
 *
 * The JSON body + SSE frame shapes (`event: chunk|done|error`) are unchanged, so
 * existing consumers keep working. Metadata (provider/mode/model/tokens/demo
 * counts) rides on the JSON body / `done` frame — never any key material.
 *
 * Gemini failures are surfaced sanitized and do NOT silently switch to Groq.
 * Groq failures before the first token fall back transparently to simulation;
 * after the first token they emit an SSE error and close (no mixed answer).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      throw new GeminiError('INVALID_REQUEST', 'Invalid JSON body.');
    }

    const url = new URL(req.url);
    const wantsStream = body.stream === true || url.searchParams.get('stream') === '1';
    const systemPrompt = (body.systemPrompt ?? '').trim();
    const userPrompt = (body.userPrompt ?? '').trim();
    const temperature = body.temperature;

    if (!userPrompt && !systemPrompt) {
      throw new GeminiError('INVALID_REQUEST', 'systemPrompt or userPrompt is required.');
    }
    // General route limit (applies to every provider).
    if (systemPrompt.length + userPrompt.length > LIMITS.maxLlmPromptChars) {
      throw new GeminiError(
        'INVALID_REQUEST',
        `Prompt is too long (max ${LIMITS.maxLlmPromptChars} characters).`,
      );
    }

    const provider = await resolveLlmProvider();

    // Resolve a concrete execution plan. Groq demo may downgrade to simulation
    // here (unauthenticated / prompt too large / allowance reached).
    const plan = await buildPlan(provider, systemPrompt, userPrompt);

    if (wantsStream) {
      return streamResponse(plan, { systemPrompt, userPrompt, temperature });
    }
    return jsonResponse(plan, { systemPrompt, userPrompt, temperature });
  } catch (err) {
    return errorResponse(err);
  }
}

/* -------------------------------------------------------------------------- */
/* Execution plan                                                              */
/* -------------------------------------------------------------------------- */

type Plan =
  | { kind: 'gemini'; apiKey: string; mode: 'gemini-byok' | 'gemini-platform' }
  | { kind: 'groq'; userId: string; remaining: number; resetAt: string }
  | {
      kind: 'sim';
      reason: LlmFallbackReason;
      demoRequestsRemaining?: number;
      demoResetAt?: string;
    };

async function buildPlan(
  provider: Awaited<ReturnType<typeof resolveLlmProvider>>,
  systemPrompt: string,
  userPrompt: string,
): Promise<Plan> {
  if (provider.mode === 'gemini-byok' || provider.mode === 'gemini-platform') {
    return { kind: 'gemini', apiKey: provider.apiKey, mode: provider.mode };
  }
  if (provider.mode === 'simulation') {
    return { kind: 'sim', reason: provider.fallbackReason };
  }

  // provider.mode === 'groq-demo' → authenticate, enforce stricter prompt cap,
  // then atomically reserve a slot. Any failure downgrades to simulation.
  const cfg = getGroqDemoConfig();

  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    // Platform-funded Groq is never available to unauthenticated callers.
    return { kind: 'sim', reason: 'GROQ_NOT_AUTHENTICATED' };
  }

  if (systemPrompt.length + userPrompt.length > cfg.maxPromptChars) {
    const usage = await getGroqDemoUsage(userId);
    return {
      kind: 'sim',
      reason: 'GROQ_PROMPT_TOO_LARGE',
      demoRequestsRemaining: Math.max(cfg.userDailyLimit - usage.requestCount, 0),
      demoResetAt: usage.resetAt,
    };
  }

  const reservation = await reserveGroqDemoRequest({
    userId,
    userDailyLimit: cfg.userDailyLimit,
    globalDailyLimit: cfg.globalDailyLimit,
  });
  if (!reservation.allowed) {
    return {
      kind: 'sim',
      reason:
        reservation.reason === 'USER_DAILY_LIMIT'
          ? 'GROQ_USER_LIMIT_REACHED'
          : 'GROQ_GLOBAL_LIMIT_REACHED',
      demoRequestsRemaining: 0,
      demoResetAt: reservation.resetAt,
    };
  }

  return { kind: 'groq', userId, remaining: reservation.remaining, resetAt: reservation.resetAt };
}

interface PromptArgs {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

/* -------------------------------------------------------------------------- */
/* Non-streaming                                                               */
/* -------------------------------------------------------------------------- */

async function jsonResponse(plan: Plan, args: PromptArgs) {
  if (plan.kind === 'sim') {
    return jsonNoStore(simBody(plan, args));
  }

  if (plan.kind === 'gemini') {
    // A connected credential is an explicit user choice: surface its errors
    // (invalid key / quota / model access) sanitized — never switch to Groq.
    const started = Date.now();
    const r = await geminiGenerate({
      apiKey: plan.apiKey,
      mode: plan.mode,
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt,
      temperature: args.temperature,
    });
    return jsonNoStore({
      text: r.text,
      source: 'gemini',
      provider: 'gemini',
      providerMode: plan.mode,
      model: r.model,
      inputTokens: r.usage?.inputTokens,
      outputTokens: r.usage?.outputTokens,
      durationMs: Date.now() - started,
    });
  }

  // plan.kind === 'groq'
  const started = Date.now();
  try {
    const r = await groqGenerate({
      systemPrompt: args.systemPrompt || undefined,
      userPrompt: args.userPrompt,
      temperature: args.temperature,
    });
    await recordGroqDemoResult({
      userId: plan.userId,
      inputTokens: r.usage?.inputTokens,
      outputTokens: r.usage?.outputTokens,
      failed: false,
    });
    return jsonNoStore({
      text: r.text,
      source: 'groq',
      provider: 'groq',
      providerMode: 'groq-demo',
      model: r.model,
      inputTokens: r.usage?.inputTokens,
      outputTokens: r.usage?.outputTokens,
      durationMs: Date.now() - started,
      demoRequestsRemaining: plan.remaining,
      demoResetAt: plan.resetAt,
    });
  } catch (err) {
    // Non-streaming Groq is all-or-nothing: a failure means no tokens were
    // returned, so fall back transparently to a labeled simulation.
    await recordGroqDemoResult({ userId: plan.userId, failed: true });
    const reason =
      err instanceof GroqError
        ? groqErrorToFallbackReason(err.code)
        : ('GROQ_UNKNOWN_ERROR' as const);
    return jsonNoStore(
      simBody(
        {
          kind: 'sim',
          reason,
          demoRequestsRemaining: plan.remaining,
          demoResetAt: plan.resetAt,
        },
        args,
      ),
    );
  }
}

function simBody(
  plan: Extract<Plan, { kind: 'sim' }>,
  args: PromptArgs,
): Record<string, unknown> {
  return {
    text: deterministicReply(args.systemPrompt, args.userPrompt),
    source: 'stub',
    provider: 'deterministic',
    providerMode: 'simulation',
    fallbackReason: plan.reason,
    ...(plan.demoRequestsRemaining !== undefined
      ? { demoRequestsRemaining: plan.demoRequestsRemaining }
      : {}),
    ...(plan.demoResetAt ? { demoResetAt: plan.demoResetAt } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Streaming (SSE)                                                             */
/* -------------------------------------------------------------------------- */

function streamResponse(plan: Plan, args: PromptArgs): Response {
  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      try {
        if (plan.kind === 'sim') {
          await streamSimulation(controller, sse, plan, args);
          return;
        }
        if (plan.kind === 'gemini') {
          await streamGemini(controller, sse, plan, args, started);
          return;
        }
        await streamGroq(controller, sse, plan, args, started);
      } catch (err) {
        // Sanitized error only — never the raw provider object/headers/key.
        const g = mapUpstreamError(err);
        controller.enqueue(sse('error', { error: g.message, code: g.code }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

type Sse = (event: string, data: unknown) => Uint8Array;

async function streamSimulation(
  controller: ReadableStreamDefaultController,
  sse: Sse,
  plan: Extract<Plan, { kind: 'sim' }>,
  args: PromptArgs,
): Promise<void> {
  const full = deterministicReply(args.systemPrompt, args.userPrompt);
  for (const piece of chunkDeterministic(full)) {
    controller.enqueue(sse('chunk', { delta: piece }));
    await sleep(15);
  }
  controller.enqueue(
    sse('done', {
      text: full,
      source: 'stub',
      provider: 'deterministic',
      providerMode: 'simulation',
      fallbackReason: plan.reason,
      ...(plan.demoRequestsRemaining !== undefined
        ? { demoRequestsRemaining: plan.demoRequestsRemaining }
        : {}),
      ...(plan.demoResetAt ? { demoResetAt: plan.demoResetAt } : {}),
    }),
  );
  controller.close();
}

async function streamGemini(
  controller: ReadableStreamDefaultController,
  sse: Sse,
  plan: Extract<Plan, { kind: 'gemini' }>,
  args: PromptArgs,
  started: number,
): Promise<void> {
  const s = await geminiStreamAdapter({
    apiKey: plan.apiKey,
    mode: plan.mode,
    systemPrompt: args.systemPrompt,
    userPrompt: args.userPrompt,
    temperature: args.temperature,
  });
  let full = '';
  while (true) {
    const next = await s.deltas.next();
    if (next.done) {
      const usage = next.value;
      controller.enqueue(
        sse('done', {
          text: full,
          source: 'gemini',
          provider: 'gemini',
          providerMode: plan.mode,
          model: s.model,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          durationMs: Date.now() - started,
        }),
      );
      controller.close();
      return;
    }
    full += next.value;
    controller.enqueue(sse('chunk', { delta: next.value }));
  }
}

async function streamGroq(
  controller: ReadableStreamDefaultController,
  sse: Sse,
  plan: Extract<Plan, { kind: 'groq' }>,
  args: PromptArgs,
  started: number,
): Promise<void> {
  let s;
  try {
    s = await groqStream({
      systemPrompt: args.systemPrompt || undefined,
      userPrompt: args.userPrompt,
      temperature: args.temperature,
    });
  } catch (err) {
    // Failure BEFORE streaming begins → transparent simulation fallback.
    await recordGroqDemoResult({ userId: plan.userId, failed: true });
    const reason =
      err instanceof GroqError ? groqErrorToFallbackReason(err.code) : 'GROQ_UNKNOWN_ERROR';
    await streamSimulation(
      controller,
      sse,
      {
        kind: 'sim',
        reason,
        demoRequestsRemaining: plan.remaining,
        demoResetAt: plan.resetAt,
      },
      args,
    );
    return;
  }

  let full = '';
  let started_streaming = false;
  try {
    while (true) {
      const next = await s.deltas.next();
      if (next.done) {
        const usage = next.value;
        await recordGroqDemoResult({
          userId: plan.userId,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          failed: false,
        });
        controller.enqueue(
          sse('done', {
            text: full,
            source: 'groq',
            provider: 'groq',
            providerMode: 'groq-demo',
            model: s.model,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            durationMs: Date.now() - started,
            demoRequestsRemaining: plan.remaining,
            demoResetAt: plan.resetAt,
          }),
        );
        controller.close();
        return;
      }
      started_streaming = true;
      full += next.value;
      controller.enqueue(sse('chunk', { delta: next.value }));
    }
  } catch (err) {
    await recordGroqDemoResult({ userId: plan.userId, failed: true });
    if (!started_streaming) {
      // Nothing emitted yet → transparent simulation fallback.
      const reason =
        err instanceof GroqError ? groqErrorToFallbackReason(err.code) : 'GROQ_UNKNOWN_ERROR';
      await streamSimulation(
        controller,
        sse,
        {
          kind: 'sim',
          reason,
          demoRequestsRemaining: plan.remaining,
          demoResetAt: plan.resetAt,
        },
        args,
      );
      return;
    }
    // Already streamed content → emit a sanitized error and close. Never append
    // a deterministic answer onto the partial Groq answer.
    const code = err instanceof GroqError ? err.code : 'GROQ_UNKNOWN_ERROR';
    controller.enqueue(sse('error', { error: 'The AI provider failed mid-response.', code }));
    controller.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
