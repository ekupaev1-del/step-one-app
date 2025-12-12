"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppLayout from "../components/AppLayout";
import "../globals.css";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
}

export default function QuestionClient() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  const [userId, setUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Привет! Я отвечаю только на вопросы о питании. Спроси, как наладить рацион, но я не выдаю готовое меню."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) setUserId(n);
    }
  }, [userIdParam]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userId })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Ошибка ответа");
      }
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Не удалось получить ответ, попробуйте позже." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) sendMessage();
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft p-6 flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-textPrimary text-center">❓ Вопросы о питании</h1>
          <p className="text-sm text-textSecondary text-center">
            Спроси про питание, привычки и продукты. Я не выдаю готовое меню, но помогу советом.
          </p>

          <div
            ref={listRef}
            className="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3 pr-2"
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-accent/10 text-textPrimary self-end" : "bg-gray-50 text-textPrimary"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Напиши вопрос о питании"
              className="w-full min-h-[80px] rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:border-accent text-textPrimary"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-full py-3 bg-accent text-white font-semibold rounded-xl shadow-soft disabled:opacity-60"
            >
              {loading ? "Отправка..." : "Спросить"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
