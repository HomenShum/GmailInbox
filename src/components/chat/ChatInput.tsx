"use client";

import { useState } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  inputId?: string;
}

export function ChatInput({ value, onChange, onSend, disabled, inputId }: ChatInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSend(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="shrink-0 p-2 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Connect an API key to chat..." : "Type a message..."}
          className="flex-1 text-[13px] px-3 py-2 rounded-md border bg-[var(--bg-subtle)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50"
          style={{ borderColor: "var(--border)" }}
          suppressHydrationWarning
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-3 py-2 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
          style={disabled || !value.trim()
            ? { background: "var(--bg-subtle)", color: "var(--text-muted)" }
            : { background: "var(--accent)", color: "white"
          }}
          suppressHydrationWarning
        >
          Send
        </button>
      </div>
    </form>
  );
}
