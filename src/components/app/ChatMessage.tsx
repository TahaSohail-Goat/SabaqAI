import React from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'model';
  text: string;
  attachmentName?: string;
  attachmentMimeType?: string;
}

// One chat bubble. Repeats per message (unlike ask/page.tsx's single non-repeating result
// block), which is what warrants pulling it out — matches ActionCard.tsx/StatCard.tsx's
// granularity: props in, JSX out, no internal state.
export default function ChatMessage({ role, text, attachmentName, attachmentMimeType }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-gradient-to-r from-brand to-brand-dark text-white'
            : 'bg-surface border border-border/50 text-navy-2 shadow-sm'
        }`}
      >
        {attachmentName && (
          <div
            className={`flex items-center gap-1.5 mb-2 text-xs font-semibold ${
              isUser ? 'text-white/90' : 'text-text-2'
            }`}
          >
            {attachmentMimeType === 'application/pdf' ? (
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span className="truncate">{attachmentName}</span>
          </div>
        )}
        {text}
      </div>
    </div>
  );
}
