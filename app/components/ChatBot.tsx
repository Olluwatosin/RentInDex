"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "bot";
  content: string;
  suggestions?: string[];
}

const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScnKYPOeajElWeapoxLw1ZP7dKEvpqeUb-NwzIw61kKqq0YOQ/viewform";

const STARTER_QUESTIONS = [
  "What's fair rent in Gwarinpa?",
  "Calculate my move-in cost",
  "Is my rent too high?",
];

const WELCOME: Message = {
  role: "bot",
  content:
    "Hey! 👋 I'm RentBot — your guide to fair rent in Nigeria. Ask me about rent prices, move-in costs, or whether your rent is fair. Starting with Abuja! 🏠",
};

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const userMessageCount = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  const extractData = async (allMessages: Message[]) => {
    const conversation = allMessages
      .slice(1)
      .map((m) => `${m.role === "user" ? "User" : "Bot"}: ${m.content}`)
      .join("\n");
    try {
      const res = await fetch("/api/chatbot/extract-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation }),
      });
      const data = await res.json();
      if (data.saved) {
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content:
              "📊 Your rent data has been added to Nigeria's rent index. Thank you for helping thousands of renters!",
          },
        ]);
      }
    } catch {
      // silent — extraction is best-effort
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;
    setHasInteracted(true);

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);
    userMessageCount.current += 1;

    try {
      const history = [...messages.slice(1), userMsg].map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();

      if (!res.ok || !data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content:
              data.error ??
              "I'm having trouble connecting right now. Please try again in a moment. 😕",
          },
        ]);
        return;
      }

      const finalMessages: Message[] = [
        ...updatedMessages,
        { role: "bot", content: data.reply, suggestions: data.suggestions },
      ];
      setMessages(finalMessages);

      // Trigger extraction every 4th user message
      if (userMessageCount.current % 4 === 0) {
        extractData(finalMessages);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: "Network issue 😕 Please check your connection and try again." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-96 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ maxHeight: "min(600px, calc(100vh - 120px))" }}
          >
            {/* Header */}
            <div className="bg-[#1B4332] px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                  🏠
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">RentBot</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-white/60 text-xs">Online · RentInDex</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-0">
              {messages.map((msg, i) => (
                <div key={i}>
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-[#1B4332] text-white rounded-br-sm"
                          : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>

                  {/* Quick replies after last bot message */}
                  {msg.role === "bot" && msg.suggestions && i === messages.length - 1 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => sendMessage(s)}
                          disabled={isTyping}
                          className="text-xs bg-white border border-[#1B4332]/20 text-[#1B4332] px-3 py-1.5 rounded-full hover:bg-[#1B4332] hover:text-white transition-all duration-200 disabled:opacity-40"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Starter questions */}
              {!hasInteracted && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {STARTER_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="text-xs bg-white border border-[#1B4332]/25 text-[#1B4332] px-3 py-1.5 rounded-full hover:bg-[#1B4332] hover:text-white transition-all duration-200"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white shadow-sm border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-gray-400 block"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-100 flex-shrink-0">
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about rent in Nigeria..."
                  disabled={isTyping}
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-transparent placeholder:text-gray-400 disabled:opacity-50 min-w-0"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="w-10 h-10 rounded-xl bg-[#1B4332] disabled:opacity-40 flex items-center justify-center text-white hover:bg-[#2D6A4F] transition-colors flex-shrink-0"
                  aria-label="Send message"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-xs text-gray-400 mt-2">
                Powered by{" "}
                <a href="https://rentindex.com.ng" className="hover:text-[#1B4332] transition-colors">
                  RentInDex
                </a>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button + hover label */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3">
        {/* "Chat with RentBot" label — slides in on hover */}
        <AnimatePresence>
          {isHovered && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 12, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.92 }}
              transition={{ duration: 0.15 }}
              className="bg-[#1B4332] text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap pointer-events-none select-none"
            >
              Chat with RentBot 🏠
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative w-14 h-14 rounded-full bg-[#1B4332] shadow-lg hover:bg-[#2D6A4F] flex items-center justify-center transition-colors hover:shadow-xl flex-shrink-0"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Open RentBot"
        >
          {/* Pulsing attention ring */}
          {!isOpen && (
            <span className="absolute inset-0 rounded-full bg-[#1B4332] animate-ping opacity-25" />
          )}

          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.15 }}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.15 }}
                className="text-2xl relative z-10"
              >
                🏠
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
