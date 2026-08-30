// The set of models a student can pick from in Chat's model selector. Shared between the route
// (which validates the client-supplied `model` id against this allowlist rather than trusting
// an arbitrary string) and the page (which renders the dropdown from the same list).
//
// Gemini 3.6 Flash — the model this app used right after the free-tier gemini-2.5-flash quota
// ran out — turned out to carry ~30s of "thinking" latency per reply even at the lowest
// thinking level (measured directly against the live API: 30-36s per response, vs <1-2.5s for
// the "lite" variants below, which return zero thinking tokens). Gemini's *-flash-lite models
// and Groq's hosted open models are both genuinely fast, so those are now the defaults; the
// heavier Gemini model stays available for anyone who wants to trade speed for it.

export interface ChatModelOption {
  id: string;
  provider: 'gemini' | 'groq';
  label: string;
  description: string;
  supportsAttachments: boolean;
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    label: 'Gemini Flash Lite',
    description: 'Fastest Gemini option — supports image & PDF attachments',
    supportsAttachments: true,
  },
  {
    id: 'openai/gpt-oss-120b',
    provider: 'groq',
    label: 'Groq GPT-OSS 120B',
    description: 'Fastest overall — text only, no attachments',
    supportsAttachments: false,
  },
  {
    id: 'gemini-3.6-flash',
    provider: 'gemini',
    label: 'Gemini Flash (smarter, slower)',
    description: 'More capable, ~30s per reply — supports attachments',
    supportsAttachments: true,
  },
];

export const DEFAULT_CHAT_MODEL_ID = CHAT_MODELS[0].id;

export function resolveChatModel(id: unknown): ChatModelOption {
  if (typeof id === 'string') {
    const match = CHAT_MODELS.find((m) => m.id === id);
    if (match) return match;
  }
  return CHAT_MODELS[0];
}
