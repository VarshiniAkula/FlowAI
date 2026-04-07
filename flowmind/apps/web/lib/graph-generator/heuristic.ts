import { nanoid } from 'nanoid';
import type { GeneratedGraph } from './prompt';

/**
 * Deterministic local generator used when no GEMINI_API_KEY is configured.
 *
 * Picks one of several archetype templates based on keywords in the story,
 * then customises labels/text to feel personalised.
 */
export function generateHeuristicGraph(story: string): GeneratedGraph {
  const text = story.toLowerCase();

  // Detect archetype — check the most specific keywords first so a generic
  // word like "help" doesn't shadow a clearly-booking story.
  if (
    text.includes('appointment') ||
    text.includes('booking') ||
    text.includes('reservation') ||
    text.includes('schedule') ||
    /\bbook\b/.test(text)
  ) {
    return bookingBot(story);
  }
  if (
    text.includes('sales') ||
    text.includes('lead') ||
    text.includes('demo') ||
    text.includes('pricing') ||
    text.includes('qualify')
  ) {
    return salesBot(story);
  }
  if (
    text.includes('survey') ||
    text.includes('feedback') ||
    text.includes('nps') ||
    text.includes('rating')
  ) {
    return feedbackBot(story);
  }
  if (
    text.includes('faq') ||
    text.includes('knowledge') ||
    text.includes('document') ||
    text.includes('docs') ||
    text.includes('manual') ||
    text.includes('answer questions')
  ) {
    return knowledgeBot(story);
  }
  if (
    text.includes('support') ||
    text.includes('troubleshoot') ||
    text.includes('ticket') ||
    text.includes('issue') ||
    text.includes('help')
  ) {
    return supportBot(story);
  }

  // Default: greet → ask question → llm response
  return defaultBot(story);
}

function supportBot(story: string): GeneratedGraph {
  return {
    name: 'Customer Support Bot',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: {
          text: "Hi! I'm your support assistant. I can help you troubleshoot issues, answer questions, or connect you with a human agent.",
        },
      },
      {
        id: 'ask_topic',
        type: 'choice',
        label: 'Topic',
        position: { x: 0, y: 160 },
        data: {
          prompt: 'What can I help you with today?',
          variableName: 'topic',
          options: [
            { id: 'opt_billing', label: 'Billing & invoices', value: 'billing' },
            { id: 'opt_technical', label: 'Technical issue', value: 'technical' },
            { id: 'opt_account', label: 'Account access', value: 'account' },
          ],
        },
      },
      {
        id: 'collect_details',
        type: 'input',
        label: 'Collect Details',
        position: { x: 0, y: 320 },
        data: {
          prompt:
            'Got it. Please describe your issue in a few sentences and Ill find the best answer.',
          variableName: 'user_issue',
        },
      },
      {
        id: 'rag_lookup',
        type: 'rag_query',
        label: 'Knowledge Lookup',
        position: { x: 0, y: 480 },
        data: {
          queryTemplate: '{{topic}}: {{user_issue}}',
          topK: 5,
          resultVariable: 'context',
        },
      },
      {
        id: 'llm_answer',
        type: 'llm_response',
        label: 'Answer',
        position: { x: 0, y: 640 },
        data: {
          systemPrompt:
            'You are a helpful support agent. Use the following knowledge base context to answer the user accurately. If the answer is not in the context, say so honestly and offer to escalate.\n\nContext:\n{{context}}',
          userTemplate: 'Topic: {{topic}}\nIssue: {{user_issue}}',
          model: 'auto',
          temperature: 0.4,
          maxTokens: 1024,
          resultVariable: 'answer',
        },
      },
      {
        id: 'reply',
        type: 'message',
        label: 'Reply',
        position: { x: 0, y: 800 },
        data: { text: '{{answer}}' },
      },
    ],
    edges: [
      edge('greet', 'ask_topic'),
      edge('ask_topic', 'collect_details', 'opt_billing'),
      edge('ask_topic', 'collect_details', 'opt_technical'),
      edge('ask_topic', 'collect_details', 'opt_account'),
      edge('collect_details', 'rag_lookup'),
      edge('rag_lookup', 'llm_answer'),
      edge('llm_answer', 'reply'),
    ],
  };
}

function salesBot(story: string): GeneratedGraph {
  return {
    name: 'Sales Qualifier',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: {
          text: "Hi! I'd love to learn more about your needs and see if we're a good fit. This will only take a minute.",
        },
      },
      {
        id: 'ask_name',
        type: 'input',
        label: 'Get Name',
        position: { x: 0, y: 160 },
        data: { prompt: "What's your name?", variableName: 'name' },
      },
      {
        id: 'ask_company',
        type: 'input',
        label: 'Get Company',
        position: { x: 0, y: 320 },
        data: {
          prompt: 'Nice to meet you {{name}}! What company are you with?',
          variableName: 'company',
        },
      },
      {
        id: 'ask_size',
        type: 'choice',
        label: 'Company Size',
        position: { x: 0, y: 480 },
        data: {
          prompt: 'How big is your team?',
          variableName: 'team_size',
          options: [
            { id: 'opt_small', label: '1–10 people', value: 'small' },
            { id: 'opt_mid', label: '11–100 people', value: 'mid' },
            { id: 'opt_large', label: '100+ people', value: 'large' },
          ],
        },
      },
      {
        id: 'ask_use_case',
        type: 'input',
        label: 'Use Case',
        position: { x: 0, y: 640 },
        data: {
          prompt: 'What problem are you hoping to solve?',
          variableName: 'use_case',
        },
      },
      {
        id: 'pitch',
        type: 'llm_response',
        label: 'Personalized Pitch',
        position: { x: 0, y: 800 },
        data: {
          systemPrompt:
            'You are an enthusiastic but honest SDR. Write a 2-paragraph response that thanks the lead, summarises how your product helps their use case, and proposes a 15-minute demo call. Be specific to their team size and use case.',
          userTemplate:
            'Lead: {{name}} from {{company}} ({{team_size}} team)\nUse case: {{use_case}}',
          model: 'auto',
          temperature: 0.7,
          maxTokens: 600,
          resultVariable: 'pitch',
        },
      },
      {
        id: 'send_pitch',
        type: 'message',
        label: 'Reply',
        position: { x: 0, y: 960 },
        data: { text: '{{pitch}}' },
      },
    ],
    edges: [
      edge('greet', 'ask_name'),
      edge('ask_name', 'ask_company'),
      edge('ask_company', 'ask_size'),
      edge('ask_size', 'ask_use_case', 'opt_small'),
      edge('ask_size', 'ask_use_case', 'opt_mid'),
      edge('ask_size', 'ask_use_case', 'opt_large'),
      edge('ask_use_case', 'pitch'),
      edge('pitch', 'send_pitch'),
    ],
  };
}

function knowledgeBot(story: string): GeneratedGraph {
  return {
    name: 'Knowledge Assistant',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: {
          text: 'Hi! Ask me anything about our documentation and Ill find the answer for you.',
        },
      },
      {
        id: 'ask_question',
        type: 'input',
        label: 'Get Question',
        position: { x: 0, y: 160 },
        data: {
          prompt: 'What would you like to know?',
          variableName: 'question',
        },
      },
      {
        id: 'rag_lookup',
        type: 'rag_query',
        label: 'Search Docs',
        position: { x: 0, y: 320 },
        data: {
          queryTemplate: '{{question}}',
          topK: 6,
          resultVariable: 'context',
        },
      },
      {
        id: 'answer',
        type: 'llm_response',
        label: 'Compose Answer',
        position: { x: 0, y: 480 },
        data: {
          systemPrompt:
            'You are a documentation expert. Answer the user using ONLY the provided context. Cite the source for each claim. If the answer is not in the context, say so clearly.\n\nContext:\n{{context}}',
          userTemplate: '{{question}}',
          model: 'auto',
          temperature: 0.2,
          maxTokens: 1024,
          resultVariable: 'answer',
        },
      },
      {
        id: 'reply',
        type: 'message',
        label: 'Reply',
        position: { x: 0, y: 640 },
        data: { text: '{{answer}}' },
      },
    ],
    edges: [
      edge('greet', 'ask_question'),
      edge('ask_question', 'rag_lookup'),
      edge('rag_lookup', 'answer'),
      edge('answer', 'reply'),
    ],
  };
}

function feedbackBot(story: string): GeneratedGraph {
  return {
    name: 'Feedback Collector',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: {
          text: "Thanks for taking a moment to share your feedback! It really helps us improve.",
        },
      },
      {
        id: 'rating',
        type: 'choice',
        label: 'NPS Rating',
        position: { x: 0, y: 160 },
        data: {
          prompt: 'How likely are you to recommend us to a friend?',
          variableName: 'nps',
          options: [
            { id: 'opt_promoter', label: '9–10 — Loving it', value: 'promoter' },
            { id: 'opt_passive', label: '7–8 — Pretty good', value: 'passive' },
            { id: 'opt_detractor', label: '0–6 — Could be better', value: 'detractor' },
          ],
        },
      },
      {
        id: 'reason',
        type: 'input',
        label: 'Reason',
        position: { x: 0, y: 320 },
        data: {
          prompt: 'Whats the main reason for your rating?',
          variableName: 'reason',
        },
      },
      {
        id: 'thank_you',
        type: 'message',
        label: 'Thank You',
        position: { x: 0, y: 480 },
        data: {
          text: 'Thank you for your feedback! Weve recorded your response.',
        },
      },
    ],
    edges: [
      edge('greet', 'rating'),
      edge('rating', 'reason', 'opt_promoter'),
      edge('rating', 'reason', 'opt_passive'),
      edge('rating', 'reason', 'opt_detractor'),
      edge('reason', 'thank_you'),
    ],
  };
}

function bookingBot(story: string): GeneratedGraph {
  return {
    name: 'Booking Assistant',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: {
          text: "Hi! I can help you book an appointment. It will only take a minute.",
        },
      },
      {
        id: 'ask_service',
        type: 'choice',
        label: 'Service',
        position: { x: 0, y: 160 },
        data: {
          prompt: 'What service are you interested in?',
          variableName: 'service',
          options: [
            { id: 'opt_consult', label: 'Consultation', value: 'consultation' },
            { id: 'opt_demo', label: 'Product demo', value: 'demo' },
            { id: 'opt_training', label: 'Training', value: 'training' },
          ],
        },
      },
      {
        id: 'ask_date',
        type: 'input',
        label: 'Date',
        position: { x: 0, y: 320 },
        data: {
          prompt: 'What date works best for you? (e.g. "next Thursday" or a specific date)',
          variableName: 'preferred_date',
        },
      },
      {
        id: 'ask_email',
        type: 'input',
        label: 'Email',
        position: { x: 0, y: 480 },
        data: {
          prompt: 'Whats your email so we can send a confirmation?',
          variableName: 'email',
        },
      },
      {
        id: 'confirm',
        type: 'message',
        label: 'Confirm',
        position: { x: 0, y: 640 },
        data: {
          text: 'Perfect — youre booked for a {{service}} on {{preferred_date}}. Confirmation will be sent to {{email}}.',
        },
      },
    ],
    edges: [
      edge('greet', 'ask_service'),
      edge('ask_service', 'ask_date', 'opt_consult'),
      edge('ask_service', 'ask_date', 'opt_demo'),
      edge('ask_service', 'ask_date', 'opt_training'),
      edge('ask_date', 'ask_email'),
      edge('ask_email', 'confirm'),
    ],
  };
}

function defaultBot(story: string): GeneratedGraph {
  return {
    name: 'AI Assistant',
    description: story.slice(0, 200),
    nodes: [
      {
        id: 'greet',
        type: 'message',
        label: 'Greet',
        position: { x: 0, y: 0 },
        data: { text: 'Hi! How can I help you today?' },
      },
      {
        id: 'ask_question',
        type: 'input',
        label: 'Get Question',
        position: { x: 0, y: 160 },
        data: { prompt: 'What would you like to know?', variableName: 'question' },
      },
      {
        id: 'answer',
        type: 'llm_response',
        label: 'Answer',
        position: { x: 0, y: 320 },
        data: {
          systemPrompt: `You are a helpful AI assistant. ${story.slice(0, 500)}`,
          userTemplate: '{{question}}',
          model: 'auto',
          temperature: 0.7,
          maxTokens: 1024,
          resultVariable: 'answer',
        },
      },
      {
        id: 'reply',
        type: 'message',
        label: 'Reply',
        position: { x: 0, y: 480 },
        data: { text: '{{answer}}' },
      },
    ],
    edges: [
      edge('greet', 'ask_question'),
      edge('ask_question', 'answer'),
      edge('answer', 'reply'),
    ],
  };
}

function edge(source: string, target: string, sourceHandle?: string) {
  return {
    id: `edge_${nanoid(6)}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}
