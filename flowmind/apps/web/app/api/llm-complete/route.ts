import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

interface Body {
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const systemPrompt = (body.systemPrompt ?? '').trim();
  const userPrompt = (body.userPrompt ?? '').trim();
  if (!userPrompt && !systemPrompt) {
    return NextResponse.json(
      { error: 'systemPrompt or userPrompt is required' },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Soft-fail with a deterministic stub so the simulator stays usable
    // even when the user hasn't wired up an API key yet.
    return NextResponse.json({
      text: stubReply(systemPrompt, userPrompt),
      source: 'stub',
    });
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        maxOutputTokens: 1024,
      },
    });
    const result = await model.generateContent(userPrompt || ' ');
    const text = result.response.text();
    return NextResponse.json({ text, source: 'gemini' });
  } catch (err) {
    console.error('[api/llm-complete] error:', err);
    return NextResponse.json(
      { error: 'LLM call failed', details: String(err) },
      { status: 500 },
    );
  }
}

function stubReply(systemPrompt: string, userPrompt: string): string {
  const sys = systemPrompt ? `(system: ${systemPrompt.slice(0, 80)}...) ` : '';
  return (
    `${sys}This is a stub response — set GEMINI_API_KEY to enable real Gemini ` +
    `completions. You asked: "${userPrompt.slice(0, 200)}"`
  );
}
