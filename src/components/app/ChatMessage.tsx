import React, { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon, Volume2, Square } from 'lucide-react';
import { speak, type SpeakHandle } from '@/lib/tts';

interface ChatMessageProps {
  role: 'user' | 'model';
  text: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  /** True while this specific reply is still streaming in — hides the Listen button, since
   *  there's nothing complete to read aloud yet. */
  isStreaming?: boolean;
}

// One chat bubble. Repeats per message (unlike ask/page.tsx's single non-repeating result
// block), which is what warrants pulling it out — matches ActionCard.tsx/StatCard.tsx's
// granularity: props in, JSX out, no internal state (except the TTS play/stop toggle below).
export default function ChatMessage({ role, text, attachmentName, attachmentMimeType, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [handle, setHandle] = useState<SpeakHandle | null>(null);

  // Stop this bubble's playback if the component unmounts mid-speech (e.g. switching
  // conversations) — otherwise the browser keeps talking over a chat that's no longer visible.
  useEffect(() => {
    return () => {
      if (isSpeaking) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSpeech = async () => {
    if (isSpeaking) {
      handle?.stop();
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    const newHandle = await speak(text, () => setIsSpeaking(false));
    setHandle(newHandle);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
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
          {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current opacity-60 animate-pulse align-middle" />}
        </div>
        {!isUser && !isStreaming && text && (
          <button
            type="button"
            onClick={toggleSpeech}
            className="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-text-3 hover:text-brand-dark transition-colors"
            aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
          >
            {isSpeaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            {isSpeaking ? 'Stop' : 'Listen'}
          </button>
        )}
      </div>
    </div>
  );
}
