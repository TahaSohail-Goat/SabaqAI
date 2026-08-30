import React from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

// The conversation-history rail — ChatGPT's defining layout element that /chat didn't have at
// all before persistence shipped (there was nothing to list). Kept as its own component since
// it repeats per conversation and has its own hover/delete interaction, same reasoning
// ChatMessage.tsx was already extracted for.
export default function ChatConversationList({ conversations, activeId, onSelect, onNew, onDelete }: ChatConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border-strong bg-surface hover:bg-surface-hover text-navy text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-text-3 text-center">No conversations yet.</p>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                activeId === c.id ? 'bg-accent-subtle text-brand-dark' : 'text-navy-2 hover:bg-surface-hover'
              }`}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span className="flex-1 min-w-0 truncate text-xs font-medium">{c.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                aria-label={`Delete "${c.title}"`}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded text-text-3 hover:text-error hover:bg-error-bg transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
