'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X, FileText, MessagesSquare, History, Mic, Square } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import ChatMessage from '@/components/app/ChatMessage';
import ChatConversationList, { type ConversationSummary } from '@/components/app/ChatConversationList';
import ChatModelSelector from '@/components/app/ChatModelSelector';
import EmptyState from '@/components/app/EmptyState';
import type { ChatResponse, TranscribeResponse } from '@/lib/types';
import { DEFAULT_CHAT_MODEL_ID, resolveChatModel } from '@/lib/chat/models';
import { loadPageProgress, savePageProgress } from '@/lib/persist/page-progress';

const PROGRESS_KEY = 'chat';

interface ChatProgress {
  activeConversationId: string | null;
  draft: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

interface DisplayMessage {
  role: 'user' | 'model';
  text: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  streaming?: boolean;
}

export default function ChatPage() {
  const { board, classLevel, user } = useScope();

  // Scoped by account so a shared device never surfaces one student's open conversation or
  // unsent draft for whoever's signed in next; logout also clears this key outright (see
  // Sidebar/IdleLogoutWatcher).
  const progressScope = user?.id ?? 'anon';

  // Both start at the same empty defaults the page always had — deliberately NOT read from
  // localStorage here. This component is server-rendered before it's hydrated, and a lazy
  // useState initializer that reads localStorage runs on the client only, so it would return
  // different content than the server-rendered HTML on the very first client render — a
  // hydration mismatch. Restoring happens in the mount effect below instead, which (like
  // ScopeContext's own localStorage restore) only ever runs client-side, after hydration.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [modelId, setModelId] = useState(DEFAULT_CHAT_MODEL_ID);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshConversations = () => {
    fetch('/api/chat/conversations')
      .then((res) => res.json())
      .then((data) => setConversations(data.conversations || []))
      .catch((err) => console.error('Conversations load error:', err));
  };

  useEffect(() => {
    refreshConversations();
  }, []);

  // Restores whichever conversation was open (and any unsent draft) before a refresh or
  // navigating away and back — the messages themselves come from the server (the actual
  // source of truth for anything already sent) via loadConversation, this just re-points the
  // view at the right thread instead of landing back on a blank "start a conversation" screen.
  // Client-only and mount-only by construction (an effect never runs during SSR), so this
  // can't cause a hydration mismatch the way reading localStorage in a state initializer would.
  useEffect(() => {
    const restored = loadPageProgress<ChatProgress>(PROGRESS_KEY, progressScope);
    if (restored?.draft) setDraft(restored.draft);
    if (restored?.activeConversationId) loadConversation(restored.activeConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only.
  }, []);

  // Persists which conversation is open and any unsent draft — see
  // src/lib/persist/page-progress.ts. Sent messages aren't included here at all; they're
  // already durable server-side once /api/chat returns an X-Conversation-Id.
  useEffect(() => {
    savePageProgress<ChatProgress>(PROGRESS_KEY, progressScope, { activeConversationId, draft });
  }, [progressScope, activeConversationId, draft]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setMobileSidebarOpen(false);
  };

  const loadConversation = async (id: string) => {
    setMobileSidebarOpen(false);
    setError(null);
    try {
      const res = await fetch(`/api/chat/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not load that conversation.');
        return;
      }
      setMessages(data.messages || []);
      setActiveConversationId(id);
    } catch (err) {
      console.error('Load conversation error:', err);
      setError('Could not reach the server. Check your connection.');
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) startNewChat();
    } catch (err) {
      console.error('Delete conversation error:', err);
    }
  };

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
    // The Groq option is text-only — switch to a model that can actually see the file rather
    // than letting the student attach something the selected model will just fail to use.
    if (!resolveChatModel(modelId).supportsAttachments) {
      setModelId(DEFAULT_CHAT_MODEL_ID);
    }
    setPendingFile(file);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Codec/container is whatever the browser's default is (Chrome/Edge: webm/opus, Safari:
      // mp4/aac) — Groq's Whisper endpoint accepts both, so no explicit mimeType is forced here.
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.set('audio', blob, 'voice-note.webm');
          const res = await fetch('/api/chat/transcribe', { method: 'POST', body: form });
          const data: TranscribeResponse = await res.json();
          if (data.status === 'ok') {
            // Voice input sends straight away, like a voice assistant — it doesn't just land in
            // the input bar for a manual Send tap. Any text already typed is prepended first,
            // so a half-typed draft isn't silently discarded by speaking instead.
            const combined = draft.trim() ? `${draft.trim()} ${data.text}` : data.text;
            handleSend(combined);
          } else {
            setError(data.message);
          }
        } catch (err) {
          console.error('Transcription error:', err);
          setError('Could not transcribe that recording. Please try again or type your message.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Could not access your microphone. Check your browser permissions and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || isSending) return;

    const userMessage: DisplayMessage = {
      role: 'user',
      text,
      attachmentName: pendingFile?.name,
      attachmentMimeType: pendingFile?.type,
    };

    // The model bubble is pushed immediately, empty and marked `streaming` — chunks fill it in
    // place as they arrive instead of waiting for the whole reply before anything appears.
    setMessages((prev) => [...prev, userMessage, { role: 'model', text: '', streaming: true }]);
    setDraft('');
    const fileToSend = pendingFile;
    setPendingFile(null);
    setIsSending(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const form = new FormData();
      form.set('message', text);
      if (activeConversationId) form.set('conversationId', activeConversationId);
      form.set('board', board);
      form.set('classLevel', String(classLevel));
      form.set('modelId', modelId);
      if (fileToSend) form.set('file', fileToSend);

      // No manual Content-Type header — the browser sets the multipart boundary itself.
      const res = await fetch('/api/chat', { method: 'POST', body: form, signal: controller.signal });

      if (!res.ok || !res.body) {
        const data: ChatResponse = await res.json();
        setError(data.status === 'error' ? data.message : 'Something went wrong. Please try again.');
        setMessages((prev) => prev.slice(0, -1)); // drop the empty placeholder bubble
        return;
      }

      const conversationId = res.headers.get('X-Conversation-Id');
      if (conversationId) setActiveConversationId(conversationId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'model', text: accumulated, streaming: true };
          return copy;
        });
      }

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'model', text: accumulated, streaming: false };
        return copy;
      });
      // Refetch rather than construct the summary locally — keeps the sidebar's title text
      // and updated_at ordering exactly what the server actually persisted, not a guess.
      refreshConversations();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Student-initiated stop, not a failure — keep whatever text streamed in so far and
        // just mark it settled.
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'model') copy[copy.length - 1] = { ...last, streaming: false };
          return copy;
        });
      } else {
        console.error('Chat error:', err);
        setError('Something went wrong. Please try again.');
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const sidebarPanel = (
    <ChatConversationList
      conversations={conversations}
      activeId={activeConversationId}
      onSelect={loadConversation}
      onNew={startNewChat}
      onDelete={deleteConversation}
    />
  );

  return (
    // AppShell's <main> has no bounded height (every other page just grows the document), so
    // this page computes its own viewport-relative height to get a pinned composer with an
    // independently scrolling message list, matching Topbar's rendered height + main's own
    // vertical padding.
    <div className="flex h-[calc(100vh-11rem)] min-h-[480px] gap-4">
      {/* Desktop: persistent conversation rail */}
      <div className="hidden lg:block w-64 flex-shrink-0 bg-surface border border-border/50 rounded-2xl overflow-hidden">
        {sidebarPanel}
      </div>

      {/* Mobile: off-canvas drawer, same pattern as the app's main Sidebar */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          mobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={() => setMobileSidebarOpen(false)} aria-hidden="true" />
        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-2xl transition-transform duration-300 ease-out ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarPanel}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 min-w-0 flex flex-col">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="lg:hidden mb-3 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-navy-2 hover:bg-surface-hover transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          Conversations
        </button>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Start a conversation"
              message="Ask anything, or attach a photo of your homework or a PDF and ask about it. This chat isn't limited to your syllabus."
            />
          ) : (
            messages.map((m, i) => (
              <ChatMessage
                key={i}
                role={m.role}
                text={m.text}
                attachmentName={m.attachmentName}
                attachmentMimeType={m.attachmentMimeType}
                isStreaming={m.streaming}
              />
            ))
          )}
          {isSending && messages[messages.length - 1]?.text === '' && (
            <div className="flex items-center gap-2 text-xs text-text-2 px-1">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
              <span>Sabaq is thinking…</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-error bg-error-bg border border-error/30 rounded-xl px-3.5 py-2.5">
            {error}
          </div>
        )}

        <div className="mt-4 bg-surface border border-border/50 rounded-2xl p-3 shadow-sm focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/20 transition-all">
          <div className="flex items-center gap-2 mb-2">
            <ChatModelSelector
              modelId={modelId}
              onChange={setModelId}
              disabled={isSending}
              attachmentPending={!!pendingFile}
            />
          </div>
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
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribing}
              className={`p-2.5 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 ${
                isRecording
                  ? 'text-error bg-error-bg animate-pulse'
                  : 'text-text-2 hover:bg-surface-hover hover:text-navy'
              }`}
              aria-label={isRecording ? 'Stop recording' : 'Record a voice message'}
            >
              {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
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
              placeholder={isTranscribing ? 'Transcribing your voice message...' : 'Ask anything...'}
              disabled={isTranscribing}
              className="flex-1 bg-transparent text-sm text-navy placeholder:text-text-3 focus:outline-none resize-none py-2 max-h-32 disabled:opacity-60"
            />
            {isSending ? (
              <button
                type="button"
                onClick={stopGenerating}
                className="p-2.5 rounded-xl bg-navy hover:bg-navy-2 transition-all active:scale-[0.97] flex-shrink-0 flex items-center justify-center"
                aria-label="Stop generating"
                title="Interrupt Sabaq's reply"
              >
                <span className="block w-3 h-3 rounded-[3px] bg-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isTranscribing || !draft.trim()}
                className="p-2.5 rounded-xl bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand disabled:from-disabled disabled:to-disabled disabled:text-disabled-text text-white transition-all active:scale-[0.97] flex-shrink-0"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
