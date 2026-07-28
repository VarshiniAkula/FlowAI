import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getGroqDemoConfig, isPlatformGeminiLlmFallbackAllowed } from '@/lib/llm/config';

const GROQ_ENV = [
  'GROQ_DEMO_ENABLED',
  'GROQ_API_KEY',
  'GROQ_LLM_MODEL',
  'GROQ_DEMO_USER_DAILY_LIMIT',
  'GROQ_DEMO_GLOBAL_DAILY_LIMIT',
  'GROQ_DEMO_MAX_PROMPT_CHARS',
  'GROQ_DEMO_MAX_OUTPUT_TOKENS',
  'GROQ_REQUEST_TIMEOUT_MS',
  'ALLOW_PLATFORM_GEMINI_LLM_FALLBACK',
];

function clearGroqEnv() {
  for (const k of GROQ_ENV) delete process.env[k];
}

describe('getGroqDemoConfig', () => {
  beforeEach(clearGroqEnv);
  afterEach(clearGroqEnv);

  it('is disabled when the flag is off, even with a key', () => {
    process.env.GROQ_API_KEY = 'gsk_secret';
    process.env.GROQ_DEMO_ENABLED = 'false';
    expect(getGroqDemoConfig().enabled).toBe(false);
  });

  it('is disabled when enabled but no key is configured', () => {
    process.env.GROQ_DEMO_ENABLED = 'true';
    expect(getGroqDemoConfig().enabled).toBe(false);
  });

  it('is enabled only with flag === "true" AND a key', () => {
    process.env.GROQ_DEMO_ENABLED = 'true';
    process.env.GROQ_API_KEY = 'gsk_secret';
    expect(getGroqDemoConfig().enabled).toBe(true);
  });

  it('defaults the model to openai/gpt-oss-20b', () => {
    expect(getGroqDemoConfig().model).toBe('openai/gpt-oss-20b');
  });

  it('uses documented defaults and rejects invalid numeric limits', () => {
    process.env.GROQ_DEMO_USER_DAILY_LIMIT = '-3';
    process.env.GROQ_DEMO_GLOBAL_DAILY_LIMIT = '0';
    process.env.GROQ_DEMO_MAX_OUTPUT_TOKENS = 'notanumber';
    const cfg = getGroqDemoConfig();
    expect(cfg.userDailyLimit).toBe(5);
    expect(cfg.globalDailyLimit).toBe(100);
    expect(cfg.maxOutputTokens).toBe(300);
    expect(cfg.maxPromptChars).toBe(6000);
  });

  it('accepts valid overrides', () => {
    process.env.GROQ_DEMO_USER_DAILY_LIMIT = '10';
    process.env.GROQ_DEMO_MAX_PROMPT_CHARS = '2000';
    const cfg = getGroqDemoConfig();
    expect(cfg.userDailyLimit).toBe(10);
    expect(cfg.maxPromptChars).toBe(2000);
  });
});

describe('isPlatformGeminiLlmFallbackAllowed', () => {
  beforeEach(clearGroqEnv);
  afterEach(clearGroqEnv);

  it('is false by default', () => {
    expect(isPlatformGeminiLlmFallbackAllowed()).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    process.env.ALLOW_PLATFORM_GEMINI_LLM_FALLBACK = 'TRUE';
    expect(isPlatformGeminiLlmFallbackAllowed()).toBe(false);
    process.env.ALLOW_PLATFORM_GEMINI_LLM_FALLBACK = 'true';
    expect(isPlatformGeminiLlmFallbackAllowed()).toBe(true);
  });
});
