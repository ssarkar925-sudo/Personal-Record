import { type AppLanguage, LANGUAGE_META } from '../../shared/i18n.ts';
import type { AgentProvider } from '../db/settings-repo.ts';
import { type AgentPlannerContext, type AgentToolCall, detectCommandLanguage } from './nlu.ts';

async function callGeminiGenerateContent(
  apiKey: string,
  model: string,
  payload: unknown,
): Promise<{ ok: boolean; text: string }> {
  const cleanKey = apiKey.trim();
  const endpoints = cleanKey.startsWith('AQ.')
    ? [
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      ]
    : [
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text) return { ok: true, text };
    } catch {
      // Try fallback endpoint or return false
    }
  }
  return { ok: false, text: '' };
}

export async function transcribeAndDetectAudioWithLLM(params: {
  provider: AgentProvider;
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; detectedLanguage: AppLanguage } | null> {
  if (params.provider === 'local' || !params.apiKey.trim()) return null;

  try {
    if (params.provider === 'gemini') {
      const model = params.model.trim() || 'gemini-2.5-flash';
      const baseMime = params.mimeType.split(';')[0].trim() || 'audio/webm';
      const result = await callGeminiGenerateContent(params.apiKey, model, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Listen to the user voice command for a personal finance & notes app.',
                  'The speaker naturally uses Bengali (বাংলা), Hindi (हिन्दी), or English — possibly switching mid-sentence.',
                  'Auto-detect the primary language spoken ("bn", "hi", or "en") and transcribe accurately in natural script (Bengali script for Bengali, Devanagari for Hindi, Latin for English; keep brand names & numbers clear).',
                  'Return ONLY valid JSON: {"transcript":"...","language":"bn"|"hi"|"en"}',
                ].join('\n'),
              },
              {
                inlineData: {
                  mimeType: baseMime,
                  data: params.audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      if (!result.ok) return null;
      const cleaned = result.text.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(cleaned) as { transcript?: string; language?: string };
      const transcript = (parsed.transcript || '').trim();
      if (!transcript) return null;
      const lang: AppLanguage =
        parsed.language === 'bn' || parsed.language === 'hi' || parsed.language === 'en'
          ? parsed.language
          : detectCommandLanguage(transcript);
      return { transcript, detectedLanguage: lang };
    }

    if (params.provider === 'openai') {
      const audioBytes = Buffer.from(params.audioBase64, 'base64');
      const baseMime = params.mimeType.split(';')[0].trim() || 'audio/webm';
      const ext = baseMime.includes('mp4') ? 'm4a' : baseMime.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('file', new Blob([audioBytes], { type: baseMime }), `voice.${ext}`);
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.apiKey.trim()}` },
        signal: AbortSignal.timeout(15000),
        body: form,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: string; language?: string };
      const transcript = (data.text || '').trim();
      if (!transcript) return null;
      const rawLang = (data.language || '').toLowerCase();
      const lang: AppLanguage =
        rawLang.startsWith('ben') || rawLang === 'bn'
          ? 'bn'
          : rawLang.startsWith('hin') || rawLang === 'hi'
            ? 'hi'
            : detectCommandLanguage(transcript);
      return { transcript, detectedLanguage: lang };
    }
    return null;
  } catch {
    return null;
  }
}

// Optional LLM enhancer when user configures Gemini or OpenAI-compatible API key.
// Always enforces: interpret EN/HI/BN -> emit structured JSON tool calls only, never touch Vault secrets.
export async function planWithOptionalLLM(params: {
  provider: AgentProvider;
  apiKey: string;
  model: string;
  commandText: string;
  systemLanguage: AppLanguage;
  ctx: AgentPlannerContext;
}): Promise<AgentToolCall[] | null> {
  if (params.provider === 'local' || !params.apiKey.trim()) return null;

  const systemPrompt = [
    'You are the planner for Personal Ledger (INR ₹, scopes: personal, business, family).',
    `The user may write in Bengali, Hindi, or English. The active System Language is "${LANGUAGE_META[params.systemLanguage].label}" (${params.systemLanguage}).`,
    'Map the command to a JSON array of tool calls from:',
    'set_system_language(language), navigate(tab, scope?), query_status(topic, scope?), create_transaction(kind, scope, amountMinor, accountId?, toAccountId?, category, occurredAt, party, note),',
    'pay_card_bill(cardId?, bankId?, amountMinor?, occurredAt), reconcile_bank(accountId?, targetBalanceMinor, occurredAt), create_account(accountType, name, scope, openingOrLimitMinor),',
    'create_due(direction, personName, amountMinor, scope, dueDate, note), settle_due(dueId?, personName, amountMinor?, bankId?, settledAt),',
    'create_loan(name, counterparty, direction, scope, principalMinor, ratePct, tenureMonths), pay_loan_emi(loanId?, amountMinor?, bankId?, paidAt),',
    'confirm_recurring_bill(billId?, paidAt), set_scope_budget(scope, monthlyLimitMinor), create_note(title, body, scope, pinned, checklistTexts),',
    'toggle_checklist(noteId?, itemQuery, done), check_alerts_now(), advisor_briefing(focus="full"|"wrong"|"predict"|"suggest"|"tasks", scope?), archive_completed_notes(), delete_last_transaction(), vault_guard().',
    'CRITICAL: Return ONLY a raw JSON array of tool objects. Express 1 Rupee as 100 paise in *Minor fields. Never access Vault passwords.',
    `Available accounts JSON: ${JSON.stringify(params.ctx.accounts.slice(0, 20))}`,
    `Available loans JSON: ${JSON.stringify(params.ctx.loans.slice(0, 15))}`,
    `Open dues JSON: ${JSON.stringify(params.ctx.dues.slice(0, 15))}`,
  ].join('\n');

  try {
    let rawJsonText = '';
    if (params.provider === 'gemini') {
      const model = params.model.trim() || 'gemini-2.5-flash';
      const result = await callGeminiGenerateContent(params.apiKey, model, {
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nCommand: ${params.commandText}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });
      if (!result.ok) return null;
      rawJsonText = result.text;
    } else if (params.provider === 'openai') {
      const model = params.model.trim() || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey.trim()}`,
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: params.commandText },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      rawJsonText = data.choices?.[0]?.message?.content ?? '';
    }

    const cleaned = rawJsonText.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.tool === 'string') {
      return parsed as AgentToolCall[];
    }
    return null;
  } catch {
    // Gracefully fall back to local offline multilingual NLU
    return null;
  }
}

export async function extractReceiptWithVisionLLM(params: {
  provider: AgentProvider;
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
  fallbackDate: string;
}): Promise<{
  vendor: string;
  amountMinor: number | null;
  occurredAt: string;
  category: string;
  kind: 'expense' | 'income';
  note: string;
} | null> {
  if (params.provider === 'local' || !params.apiKey.trim()) return null;

  const prompt = [
    'Extract invoice/receipt details from this image for an INR finance tracker.',
    `Default date if missing: ${params.fallbackDate}.`,
    'Return ONLY valid JSON: {"vendor":"...","amountRupees":123.45,"occurredAt":"YYYY-MM-DD","category":"Food & Dining|Shopping & Groceries|Travel & Fuel|Utilities & Telecom|Medical & Health|Subscriptions|Taxes|General","kind":"expense","note":"short summary"}',
  ].join('\n');

  try {
    let rawJson = '';
    const baseMime = params.mimeType.split(';')[0].trim() || 'image/jpeg';

    if (params.provider === 'gemini') {
      const model = params.model.trim() || 'gemini-2.5-flash';
      const result = await callGeminiGenerateContent(params.apiKey, model, {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: baseMime, data: params.imageBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      if (!result.ok) return null;
      rawJson = result.text;
    } else if (params.provider === 'openai') {
      const model = params.model.trim() || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey.trim()}`,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${baseMime};base64,${params.imageBase64}` } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      rawJson = data.choices?.[0]?.message?.content ?? '';
    }

    const cleaned = rawJson.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned) as {
      vendor?: string;
      amountRupees?: number | string;
      occurredAt?: string;
      category?: string;
      kind?: string;
      note?: string;
    };
    const rawNum = parsed.amountRupees !== undefined ? Number(parsed.amountRupees) : NaN;
    const amountMinor = Number.isFinite(rawNum) && rawNum > 0 ? Math.round(rawNum * 100) : null;
    const occurredAt =
      parsed.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(parsed.occurredAt) ? parsed.occurredAt : params.fallbackDate;
    return {
      vendor: (parsed.vendor || 'Receipt Purchase').trim().slice(0, 60),
      amountMinor,
      occurredAt,
      category: (parsed.category || 'General').trim().slice(0, 45),
      kind: parsed.kind === 'income' ? 'income' : 'expense',
      note: (parsed.note || `Receipt: ${parsed.vendor || 'Scanned'}`).trim().slice(0, 120),
    };
  } catch {
    return null;
  }
}
