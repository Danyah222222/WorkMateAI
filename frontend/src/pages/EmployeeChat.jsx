import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Sparkles, Send, Plus, MessageSquare, LogOut, Trash2, FileText, User, ThumbsUp, ThumbsDown, CalendarCheck } from "lucide-react";

const SUGGESTIONS = [
  "Who is the HR manager?",
  "What is the remote work policy?",
  "How many annual leave days do I get?",
  "Find the IT department contact.",
];

export default function EmployeeChat() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef(null);

  const loadConvs = () => api.get("/conversations").then(r => setConversations(r.data));

  useEffect(() => { loadConvs(); }, []);
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    api.get(`/conversations/${activeId}/messages`).then(r => setMessages(r.data));
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText]);

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setStreaming(true);
    setStreamText("");

    try {
      const token = localStorage.getItem("wm_token");
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, conversation_id: activeId }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let currentConvId = activeId;
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          const payload = p.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "meta" && !currentConvId) {
              currentConvId = evt.conversation_id;
              setActiveId(currentConvId);
            } else if (evt.type === "delta") {
              acc += evt.content;
              setStreamText(acc);
            } else if (evt.type === "done") {
              // finalize
              setMessages((m) => [...m, { id: evt.message_id || `a-${Date.now()}`, role: "assistant", content: acc }]);
              setStreamText("");
              loadConvs();
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setMessages((m) => [...m, { id: `a-err-${Date.now()}`, role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  };

  const newChat = () => { setActiveId(null); setMessages([]); };

  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const submitLeaveTest = async () => {
    setLeaveSubmitting(true);
    try {
      const res = await api.post("/webhooks/leave-request");
      if (res.data?.ok) {
        toast.success("Leave request submitted successfully");
      } else {
        const detail = res.data?.response?.message || `n8n returned ${res.data?.status_code}`;
        toast.error(`Webhook responded: ${detail}`);
      }
    } catch (e) {
      toast.error(`Failed to submit leave request: ${e.response?.data?.detail || e.message}`);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const removeConv = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/conversations/${id}`);
    if (activeId === id) { setActiveId(null); setMessages([]); }
    loadConvs();
  };

  return (
    <div className="h-screen flex bg-background text-foreground" data-testid="employee-chat">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-e border-border bg-card/30">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="display font-bold tracking-tight">WorkMate<span className="text-primary">.</span>AI</div>
          </div>
          <Button data-testid="new-chat-btn" onClick={newChat} className="w-full rounded-md gap-2" variant="outline">
            <Plus className="h-4 w-4" strokeWidth={2} /> {t("new_chat")}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground text-center">{t("no_history")}</div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                data-testid={`conv-${c.id}`}
                onClick={() => setActiveId(c.id)}
                className={`group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-start transition-colors ${
                  activeId === c.id ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex-1 truncate">{c.title}</span>
                <span onClick={(e) => removeConv(c.id, e)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-border">
          <div className="px-2 py-1.5 text-xs">
            <div className="font-medium truncate">{user?.name}</div>
            <div className="text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            data-testid="chat-logout-btn"
            onClick={logout}
            className="w-full mt-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 sm:px-6 backdrop-blur-xl bg-background/70">
          <div className="md:hidden flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <span className="display font-bold">WorkMate<span className="text-primary">.</span>AI</span>
          </div>
          <div className="hidden md:block text-sm text-muted-foreground">Your private company assistant</div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="submit-leave-request-btn"
              variant="outline"
              size="sm"
              onClick={submitLeaveTest}
              disabled={leaveSubmitting}
              className="rounded-full gap-2"
            >
              <CalendarCheck className="h-4 w-4" strokeWidth={1.5} />
              {leaveSubmitting ? "Submitting…" : "Submit Leave Request"}
            </Button>
            <LanguageToggle />
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
            {messages.length === 0 && !streaming ? (
              <div className="text-center py-12 space-y-6 animate-in-up">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                  <Sparkles className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="display text-3xl font-bold tracking-tight">Ask anything about your workplace.</h2>
                  <p className="text-muted-foreground mt-2">Sourced answers from your company&apos;s directory and policies.</p>
                </div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground pt-4">{t("suggested")}</div>
                <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      data-testid={`suggested-${i}`}
                      onClick={() => send(s)}
                      className="text-start p-3 rounded-lg border border-border bg-card hover:border-primary hover:-translate-y-0.5 transition-all text-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
                {streaming && (
                  <div className="animate-in-up">
                    {streamText ? <MessageBubble m={{ role: "assistant", content: streamText }} /> : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
                        {t("thinking")}…
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-background/70 backdrop-blur-xl">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="mx-auto max-w-3xl px-4 sm:px-6 py-4"
            data-testid="chat-form"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary transition-colors">
              <textarea
                data-testid="chat-input"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault(); send();
                  }
                }}
                placeholder={t("chat_placeholder")}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none max-h-40"
              />
              <Button
                type="submit"
                data-testid="chat-send-btn"
                size="icon"
                disabled={streaming || !input.trim()}
                className="rounded-xl h-9 w-9 flex-shrink-0"
              >
                <Send className="h-4 w-4 rtl-flip" strokeWidth={2} />
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({ m }) {
  const [rating, setRating] = useState(null);
  if (m.role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end animate-in-up">
        <div className="max-w-[80%] rounded-2xl rounded-se-md bg-secondary px-4 py-2.5 text-sm">
          {m.content}
        </div>
        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-secondary grid place-items-center">
          <User className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
    );
  }
  // Assistant - parse source line
  const content = m.content || "";
  const sourceMatch = content.match(/\*{0,2}Source\*{0,2}\s*:\s*\*{0,2}\s*([^\n]+?)\*{0,2}\s*$/im);
  let body = sourceMatch ? content.slice(0, sourceMatch.index).trim() : content;
  // strip trailing dangling markdown bold marker on last line
  body = body.replace(/\*{1,3}\s*$/, "").trim();
  const source = sourceMatch ? sourceMatch[1].trim().replace(/\*+$/, "").trim() : null;

  const rate = async (val) => {
    if (!m.id || m.id.startsWith("a-") || rating === val) return;
    setRating(val);
    try {
      await api.post(`/messages/${m.id}/feedback`, { rating: val });
      toast.success(val === "up" ? "Thanks for the feedback" : "We'll use this to improve");
    } catch {
      setRating(null);
      toast.error("Could not save feedback");
    }
  };

  const canRate = m.id && !m.id.startsWith("a-");

  return (
    <div className="flex items-start gap-3 animate-in-up">
      <div className="h-8 w-8 flex-shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center">
        <Sparkles className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="flex-1 space-y-3">
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{body}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {source && (
            <div className="inline-flex items-center gap-2 text-xs rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground">
              <FileText className="h-3 w-3" strokeWidth={1.5} />
              <span className="font-medium text-foreground">Source:</span> {source}
            </div>
          )}
          {canRate && (
            <div className="inline-flex items-center gap-1 ms-auto">
              <button
                data-testid={`thumb-up-${m.id}`}
                onClick={() => rate("up")}
                aria-label="Helpful"
                className={`h-7 w-7 grid place-items-center rounded-md border transition-colors ${
                  rating === "up"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                data-testid={`thumb-down-${m.id}`}
                onClick={() => rate("down")}
                aria-label="Not helpful"
                className={`h-7 w-7 grid place-items-center rounded-md border transition-colors ${
                  rating === "down"
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
