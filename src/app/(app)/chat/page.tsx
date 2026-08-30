'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, FileText, MessagesSquare } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import ChatMessage from '@/components/app/ChatMessage';
import EmptyState from '@/components/app/EmptyState';
import type { ChatResponse, ChatTurn } from '@/lib/types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

interface DisplayMessage {
  role: 'user' | 'model';
  text: string;
  attachmentName?: string;
  attachmentMimeType?: string;
}

export default function ChatPage() {
  const { board, classLevel } = useScope();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Attach a JPEG, PNG, WEBP image, or a PDF.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File is too large. Attach something under 10MB.');
      return;
    }
    setError(null);
    setPendingFile(file);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    const userMessage: DisplayMessage = {
      role: 'user',
      text,
      attachmentName: pendingFile?.name,
      attachmentMimeType: pendingFile?.type,
    };
    // Sent as-is on every request — there's no server-side session, so the full running
    // history is replayed each time (attachment bytes from earlier turns are never resent,
    // only the name/mimeType survive — see ChatTurn's comment in src/lib/types.ts).
    const history: ChatTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
      attachmentName: m.attachmentName,
      attachmentMimeType: m.attachmentMimeType,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    const fileToSend = pendingFile;
    setPendingFile(null);
    setIsSending(true);
    setError(null);

    try {
      const form = new FormData();
      form.set('message', text);
      form.set('history', JSON.stringify(history));
      form.set('board', board);
      form.set('classLevel', String(classLevel));
      if (fileToSend) form.set('file', fileToSend);

      // No manual Content-Type header — the browser sets the multipart boundary itself.
      const res = await fetch('/api/chat', { method: 'POST', body: form });
      const data: ChatResponse = await res.json();

      if (data.status === 'ok') {
        setMessages((prev) => [...prev, { role: 'model', text: data.reply }]);
      } else {
        setError(data.message);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    // AppShell's <main> has no bounded height (every other page just grows the document), so
    // this page computes its own viewport-relative height to get a pinned composer with an
    // independently scrolling message list, matching Topbar's rendered height + main's own
    // vertical padding.
    <div className="flex flex-col h-[calc(100vh-11rem)] min-h-[420px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Start a conversation"
            message="Ask anything, or attach a photo of your homework or a PDF and ask about it. This chat isn't limited to your syllabus."
          />
        ) : (
          messages.map((m, i) => <ChatMessage key={i} {...m} />)
        )}
        {isSending && (
          <div className="flex items-center gap-2 text-xs text-text-2 px-1">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span>Sabaq is typing…</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 text-xs text-error bg-error-bg border border-error/30 rounded-xl px-3.5 py-2.5">
          {error}
        </div>
      )}

      <div className="mt-4 bg-surface border border-border/50 rounded-2xl p-3 shadow-sm focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/20 transition-all">
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-surface-2 rounded-lg text-xs text-navy-2 w-fit max-w-full">
            <FileText className="w-3.5 h-3.5 text-brand flex-shrink-0" />
            <span className="truncate">{pendingFile.name}</span>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="text-text-3 hover:text-navy transition-colors"
              aria-label="Remove attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl text-text-2 hover:bg-surface-hover hover:text-navy transition-colors flex-shrink-0"
            aria-label="Attach a file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFilePick}
            className="hidden"
          />
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything..."
            className="flex-1 bg-transparent text-sm text-navy placeholder:text-text-3 focus:outline-none resize-none py-2 max-h-32"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || !draft.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand disabled:from-disabled disabled:to-disabled disabled:text-disabled-text text-white transition-all active:scale-[0.97] flex-shrink-0"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
