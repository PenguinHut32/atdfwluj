"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  ImagePlus,
  Info,
  LockKeyhole,
  Menu,
  MoreVertical,
  Search,
  Send,
  Smile,
  Sparkle,
  Trash2,
  Download,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GREETING, type ChatMessage } from "@/lib/chat";
import { parseHistory, serializeHistory, STORAGE_KEY } from "@/lib/history";
import { Crest } from "./crest";
import { SoundToggle } from "./experience-provider";

const greeting = GREETING;
const invitationNames: Record<string, string> = {
  path: "За пределами видимого",
  power: "Природа твоей силы",
  truth: "По ту сторону морали",
};
const openingPrompts: Record<string, string[]> = {
  path: [
    "Я хочу увидеть больше",
    "Ты станешь моим наставником?",
    "Покажи свой мир",
  ],
  power: ["В чём настоящая сила?", "Научи меня контролю", "Чего ты боишься?"],
  truth: [
    "Ты считаешь себя правым?",
    "Почему ты выбрал этот путь?",
    "Что ты думаешь о Годжо?",
  ],
  default: [
    "Почему ты выбрал этот путь?",
    "Расскажи о себе",
    "Покажи свой мир",
  ],
};
const makeMessage = (
  role: ChatMessage["role"],
  content: string,
  image?: ChatMessage["image"],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: Date.now(),
  ...(image ? { image } : {}),
});
const newGreeting = () => makeMessage("assistant", greeting);

function readHistory(): ChatMessage[] | null {
  try {
    return parseHistory(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const start = text
    .toLocaleLowerCase("ru")
    .indexOf(query.toLocaleLowerCase("ru"));
  return start < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + query.length)}</mark>
      {text.slice(start + query.length)}
    </>
  );
}

export function Messenger() {
  const params = useSearchParams();
  const invitation = params.get("invitation") || "";
  const selectedInvitation = Object.hasOwn(invitationNames, invitation)
    ? invitation
    : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [mode, setMode] = useState<"live" | "demo" | "offline" | "loading">(
    "loading",
  );
  const [imageGeneration, setImageGeneration] = useState(false);
  const [menu, setMenu] = useState<"more" | "media" | "emoji" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewedImage, setViewedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const profile = useRef<HTMLDialogElement>(null);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busyLock = useRef(false);
  const atBottom = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMessages(readHistory() || [newGreeting()]);
      setReady(true);
    });
    const controller = new AbortController();
    fetch("/api/chat", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setMode(data.mode === "live" ? "live" : "demo");
        setImageGeneration(data.imageGeneration === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMode("offline");
      });
    return () => {
      cancelAnimationFrame(id);
      controller.abort();
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready || busy || messages.at(-1)?.role !== "assistant") return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeHistory(messages));
    } catch {
      queueMicrotask(() => setStorageWarning(true));
    }
  }, [messages, ready, busy]);

  useEffect(() => {
    if (atBottom.current)
      scroll.current?.scrollTo({
        top: scroll.current.scrollHeight,
        behavior: reduced ? "instant" : "smooth",
      });
  }, [messages, busy, ready, reduced]);

  useEffect(() => {
    if (!menu) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-popover]"))
        setMenu(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menu]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>(".chat-sidebar");
    sidebar?.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    const media = window.matchMedia("(max-width: 700px)");
    const onResize = () => {
      if (!media.matches) setSidebarOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>("a[href], button, input"),
      ).filter(
        (element) =>
          element.getClientRects().length && !element.hasAttribute("disabled"),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    media.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onResize);
      previous?.focus();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (viewedImage) imageDialog.current?.showModal();
  }, [viewedImage]);

  async function send(content = draft, requestImage = false) {
    const text = content.trim();
    if (!text || busyLock.current || !ready || text.length > 6000) return;
    if (messages.length >= 149) {
      setError(
        "Этот разговор достиг предела контекста. Сохрани его через меню и начни новый диалог.",
      );
      return;
    }
    const previous = messages;
    const next: ChatMessage[] = [...messages, makeMessage("user", text)];
    busyLock.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    setMenu(null);
    setMessages(next);
    if (composer.current) composer.current.style.height = "24px";
    atBottom.current = true;
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 150000);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          invitation: selectedInvitation,
          requestImage,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Не удалось получить ответ. Попробуй ещё раз.",
        );
      if (typeof data.text !== "string" || !data.text.trim())
        throw new Error("Получен пустой ответ. Попробуй ещё раз.");
      if (controller.signal.aborted) return;
      setMode(data.mode === "live" ? "live" : "demo");
      const safeImage =
        data.image &&
        typeof data.image.src === "string" &&
        (data.image.src.startsWith("data:image/png;base64,") ||
          [
            "/images/geto.webp",
            "/images/shrine.svg",
            "/images/spirit.svg",
          ].includes(data.image.src))
          ? {
              src: data.image.src,
              alt:
                typeof data.image.alt === "string"
                  ? data.image.alt
                  : "Изображение от Гето",
            }
          : undefined;
      setMessages([...next, makeMessage("assistant", data.text, safeImage)]);
    } catch (failure) {
      if (controller.signal.aborted && controller.signal.reason !== "timeout")
        return;
      setMessages(previous);
      setDraft(text);
      setError(
        controller.signal.reason === "timeout"
          ? "Ответ задержался. Сообщение не потеряно, попробуй отправить снова."
          : failure instanceof Error
            ? failure.message
            : "Связь прервалась. Твоё сообщение сохранено в поле ввода.",
      );
    } finally {
      clearTimeout(timeout);
      if (abort.current === controller) {
        busyLock.current = false;
        setBusy(false);
        abort.current = null;
        composer.current?.focus();
      }
    }
  }

  function clearHistory() {
    abort.current?.abort();
    abort.current = null;
    busyLock.current = false;
    setBusy(false);
    setMessages([newGreeting()]);
    setError("");
    setDraft("");
    setQuery("");
    setSearchOpen(false);
    setMenu(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      setStorageWarning(true);
    }
    clearDialog.current?.close();
    composer.current?.focus();
  }

  function exportHistory() {
    const content = messages
      .map(
        (message) =>
          `${new Date(message.timestamp).toLocaleString("ru-RU")} · ${message.role === "user" ? "Ты" : "Сугуру Гето"}\n${message.content}${message.image ? `\n[Изображение: ${message.image.alt}]` : ""}`,
      )
      .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([`GETO · Личный диалог\n\n${content}`], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "geto-dialogue.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMenu(null);
  }

  const hasContact = "сугуру гето suguru geto".includes(
    contactQuery.toLowerCase().trim(),
  );
  const matchCount = query.trim()
    ? messages.filter((message) =>
        message.content.toLowerCase().includes(query.toLowerCase()),
      ).length
    : 0;
  const modeLabel =
    mode === "demo"
      ? "Демонстрационный режим"
      : mode === "live"
        ? "ИИ-персонаж · личный диалог"
        : mode === "offline"
          ? "Связь недоступна"
          : "Соединение…";

  return (
    <main className="messenger">
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Закрыть список диалогов"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`chat-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen || undefined}
        aria-label="Личные диалоги"
      >
        <div className="sidebar-brand">
          <Link href="/" className="wordmark">
            <Crest />
            <span>
              GETO<small>PRIVATE DOMAIN</small>
            </span>
          </Link>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Закрыть меню"
          >
            <X size={19} />
          </button>
          <Link
            className="icon-button sidebar-home"
            href="/"
            aria-label="Вернуться в пространство"
          >
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="contact-search">
          <Search size={15} />
          <input
            aria-label="Найти контакт"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
            placeholder="Поиск"
          />
        </div>
        <div className="sidebar-label">
          ЛИЧНЫЕ ДИАЛОГИ <span>01</span>
        </div>
        {hasContact ? (
          <button
            className="contact active-contact"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="avatar">
              <Image src="/images/avatar.webp" alt="" width={50} height={50} />
              <i />
            </span>
            <span className="contact-body">
              <span className="contact-name">
                Сугуру Гето <span>傑</span>
              </span>
              <span className="contact-preview">
                {busy ? "печатает…" : messages.at(-1)?.content || greeting}
              </span>
            </span>
          </button>
        ) : (
          <p className="no-contact">Здесь есть только Гето.</p>
        )}
        <div className="sidebar-quiet">
          <span>静寂</span>
          <p>
            Лишних голосов
            <br />
            здесь не будет.
          </p>
        </div>
        <div className="sidebar-bottom">
          <SoundToggle compact />
          <div>
            <LockKeyhole size={12} />
            <span>Твоё личное пространство</span>
          </div>
          <Link href="/">
            Вернуться за порог <ArrowUpRight size={12} />
          </Link>
        </div>
      </aside>

      <section
        className="conversation"
        aria-label="Диалог с Сугуру Гето"
        inert={sidebarOpen}
      >
        <header className="chat-header">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть список диалогов"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>
          <button
            className="chat-person"
            onClick={() => profile.current?.showModal()}
          >
            <span className="avatar header-avatar">
              <Image src="/images/avatar.webp" alt="" width={42} height={42} />
            </span>
            <span>
              <strong>
                Сугуру Гето{" "}
                <span className="character-mark">
                  <Sparkle size={11} />
                </span>
              </strong>
              <small>
                {busy ? (
                  <span className="typing-label">
                    печатает<span>…</span>
                  </span>
                ) : (
                  modeLabel
                )}
              </small>
            </span>
          </button>
          <div className="chat-header-actions">
            <button
              className="icon-button"
              aria-label="Поиск в переписке"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen);
                setQuery("");
              }}
            >
              <Search size={19} />
            </button>
            <div className="popover-anchor" data-popover>
              <button
                className="icon-button"
                aria-label="Меню диалога"
                aria-expanded={menu === "more"}
                onClick={() => setMenu(menu === "more" ? null : "more")}
              >
                <MoreVertical size={21} />
              </button>
              {menu === "more" && (
                <div className="chat-popover more-popover">
                  <button
                    onClick={() => {
                      profile.current?.showModal();
                      setMenu(null);
                    }}
                  >
                    <Info size={16} /> О собеседнике
                  </button>
                  <button onClick={exportHistory} disabled={!ready}>
                    <Download size={16} /> Сохранить переписку
                  </button>
                  <button
                    onClick={() => {
                      clearDialog.current?.showModal();
                      setMenu(null);
                    }}
                  >
                    <Trash2 size={16} /> Начать заново
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {searchOpen && (
          <div className="message-search">
            <Search size={15} />
            <input
              autoFocus
              aria-label="Поиск сообщений"
              placeholder="Найти в разговоре…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>{query ? `${matchCount} совпадений` : ""}</span>
            <button
              className="icon-button"
              aria-label="Закрыть поиск"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {selectedInvitation && (
          <div className="invitation-banner">
            <span className="banner-line" />
            <span>
              ПРИГЛАШЕНИЕ ПРИНЯТО
              <small>{invitationNames[selectedInvitation]}</small>
            </span>
            <Crest />
          </div>
        )}
        <div
          className="chat-scroll"
          ref={scroll}
          onScroll={() => {
            const element = scroll.current;
            if (element) {
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                120;
              atBottom.current = nearBottom;
              setShowScrollDown(!nearBottom);
            }
          }}
        >
          <div className="chat-watermark" aria-hidden="true">
            <Crest />
            <span>夏油傑</span>
          </div>
          <div className="messages-column">
            <div className="conversation-intro">
              <span className="date-pill">Начало разговора</span>
              <div className="conversation-notice">
                <LockKeyhole size={11} />
                <span>За этой дверью можно быть собой.</span>
              </div>
            </div>
            <div
              className="message-list"
              role="log"
              aria-label="Сообщения"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message) => (
                <motion.div
                  initial={{ opacity: 0, y: 9 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.3 }}
                  className={`message-row ${message.role === "user" ? "outgoing" : "incoming"} ${query && !message.content.toLowerCase().includes(query.toLowerCase()) ? "not-matched" : ""}`}
                  key={message.id}
                >
                  {message.role === "assistant" && (
                    <span className="avatar message-avatar">
                      <Image
                        src="/images/avatar.webp"
                        width={30}
                        height={30}
                        alt="Гето"
                      />
                    </span>
                  )}
                  <div
                    className={`message-bubble ${message.image ? "with-image" : ""}`}
                  >
                    {message.role === "assistant" && (
                      <span className="bubble-name">Сугуру Гето</span>
                    )}
                    {message.image && (
                      <button
                        className="message-image"
                        onClick={() => setViewedImage(message.image!)}
                        aria-label="Открыть изображение"
                      >
                        <Image
                          src={message.image.src}
                          alt={message.image.alt}
                          width={360}
                          height={430}
                          unoptimized
                          className={
                            message.image.src.includes("geto.webp")
                              ? "portrait-message"
                              : ""
                          }
                          onLoad={() => {
                            if (atBottom.current)
                              scroll.current?.scrollTo({
                                top: scroll.current.scrollHeight,
                              });
                          }}
                        />
                      </button>
                    )}
                    <p>{highlight(message.content, query)}</p>
                    <div className="message-meta">
                      <time
                        dateTime={new Date(message.timestamp).toISOString()}
                      >
                        {new Date(message.timestamp).toLocaleTimeString(
                          "ru-RU",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>
                      {message.role === "user" && <CheckCheck size={13} />}
                    </div>
                  </div>
                </motion.div>
              ))}
              <AnimatePresence>
                {busy && (
                  <motion.div
                    className="message-row incoming"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="avatar message-avatar">
                      <Image
                        src="/images/avatar.webp"
                        width={30}
                        height={30}
                        alt=""
                      />
                    </span>
                    <div
                      className="typing-bubble"
                      aria-label="Гето готовит ответ"
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {ready && messages.length === 1 && !busy && (
              <div className="suggested-prompts">
                <span>С чего начнёшь?</span>
                {openingPrompts[selectedInvitation || "default"].map(
                  (prompt) => (
                    <button key={prompt} onClick={() => void send(prompt)}>
                      {prompt}
                      <ArrowUpRight size={13} />
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
        {showScrollDown && (
          <button
            className="scroll-bottom icon-button"
            aria-label="К последнему сообщению"
            onClick={() => {
              atBottom.current = true;
              scroll.current?.scrollTo({
                top: scroll.current.scrollHeight,
                behavior: reduced ? "instant" : "smooth",
              });
            }}
          >
            <ChevronDown size={20} />
          </button>
        )}
        <div className="composer-area">
          {(error || storageWarning) && (
            <div className="chat-error" role="alert">
              <Info size={14} />
              <span>
                {error ||
                  "Браузер не сохраняет историю. Скачай переписку через меню перед закрытием."}
              </span>
              <button
                className="icon-button"
                aria-label="Скрыть предупреждение"
                onClick={() => {
                  setError("");
                  setStorageWarning(false);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="popover-anchor" data-popover>
              <button
                type="button"
                className="icon-button"
                aria-label="Попросить изображение"
                disabled={busy || !ready}
                aria-expanded={menu === "media"}
                onClick={() => setMenu(menu === "media" ? null : "media")}
              >
                <ImagePlus size={22} />
              </button>
              {menu === "media" && (
                <div className="chat-popover media-popover">
                  <small>
                    {imageGeneration ? "СОЗДАТЬ ИЗОБРАЖЕНИЕ" : "ЛИЧНЫЙ АРХИВ"}
                  </small>
                  <button
                    type="button"
                    onClick={() => void send("Покажи свой портрет.", true)}
                  >
                    <ImagePlus size={15} />
                    {imageGeneration ? "Новый портрет" : "Портрет Гето"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void send("Покажи свой мир, твоё убежище.")}
                  >
                    <Crest /> Убежище
                  </button>
                  <button
                    type="button"
                    onClick={() => void send("Покажи проклятого духа.")}
                  >
                    <span className="media-symbol">◌</span> Проклятая энергия
                  </button>
                </div>
              )}
            </div>
            <textarea
              ref={composer}
              value={draft}
              disabled={busy || !ready}
              maxLength={6000}
              rows={1}
              aria-label="Сообщение Гето"
              placeholder={
                busy ? "Гето обдумывает ответ…" : "Скажи, что у тебя на уме…"
              }
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "24px";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="popover-anchor emoji-anchor" data-popover>
              <button
                type="button"
                className="icon-button"
                aria-label="Добавить эмодзи"
                disabled={busy || !ready}
                aria-expanded={menu === "emoji"}
                onClick={() => setMenu(menu === "emoji" ? null : "emoji")}
              >
                <Smile size={21} />
              </button>
              {menu === "emoji" && (
                <div className="emoji-popover">
                  {["🖤", "🙂", "✨", "🌒", "😏", "👀"].map((emoji) => (
                    <button
                      type="button"
                      aria-label={`Добавить ${emoji}`}
                      key={emoji}
                      onClick={() => {
                        setDraft((value) => (value + emoji).slice(0, 6000));
                        setMenu(null);
                        composer.current?.focus();
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="send-button"
              type="submit"
              aria-label="Отправить сообщение"
              disabled={!draft.trim() || busy || !ready}
            >
              <Send size={19} />
            </button>
          </form>
          <div className="composer-footnote">
            <span>
              {mode === "demo"
                ? "Деморежим: сценарные ответы · ИИ не подключён"
                : mode === "live"
                  ? "ИИ-персонаж · Текст передаётся OpenAI"
                  : mode === "offline"
                    ? "Сервис недоступен. Можно попробовать отправить сообщение."
                    : "Проверяем соединение…"}
            </span>
            <span className="enter-tip">
              {draft.length > 5500
                ? `${draft.length} / 6000`
                : "Enter — отправить"}
            </span>
          </div>
        </div>
      </section>

      <dialog ref={profile} className="info-dialog profile-dialog">
        <button
          className="icon-button dialog-close"
          aria-label="Закрыть профиль"
          onClick={() => profile.current?.close()}
        >
          <X size={20} />
        </button>
        <span className="avatar profile-avatar">
          <Image
            src="/images/avatar.webp"
            alt="Сугуру Гето"
            width={100}
            height={100}
          />
        </span>
        <span className="eyebrow">呪霊操術 · ОСОБЫЙ РАНГ</span>
        <h2>Сугуру Гето</h2>
        <blockquote>
          «Не бойся тишины.
          <br />В ней слышно самое важное.»
        </blockquote>
        <div className="profile-details">
          <span>
            СОБЕСЕДНИК<strong>ИИ-персонаж · Фан-проект</strong>
          </span>
          <span>
            ПРОСТРАНСТВО<strong>Только один диалог. Никакого шума.</strong>
          </span>
          <span>
            ПАМЯТЬ<strong>История хранится в этом браузере.</strong>
          </span>
        </div>
        <p>
          При подключённом ИИ текст переписки обрабатывает OpenAI. Не отправляй
          чувствительные данные. Сгенерированные изображения доступны до
          закрытия страницы: сохрани их отдельно через просмотр изображения. Это
          художественная интерпретация персонажа, не реальный человек.
        </p>
        <button
          className="primary-button"
          onClick={() => profile.current?.close()}
        >
          Вернуться к разговору <ArrowLeft size={16} />
        </button>
      </dialog>
      <dialog ref={clearDialog} className="info-dialog">
        <button
          className="icon-button dialog-close"
          aria-label="Закрыть"
          onClick={() => clearDialog.current?.close()}
        >
          <X size={20} />
        </button>
        <Crest />
        <h2>Начать с чистого листа?</h2>
        <p>
          Вся переписка в этом браузере будет удалена. Сначала сохрани её через
          меню, если хочешь оставить себе.
        </p>
        <div className="confirm-actions">
          <button onClick={() => clearDialog.current?.close()}>
            Оставить диалог
          </button>
          <button onClick={clearHistory}>Удалить и начать заново</button>
        </div>
      </dialog>
      <dialog
        ref={imageDialog}
        className="image-lightbox"
        onClose={() => setViewedImage(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            imageDialog.current?.close();
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Закрыть изображение"
          onClick={() => imageDialog.current?.close()}
        >
          <X size={25} />
        </button>
        {viewedImage && (
          <>
            <Image
              src={viewedImage.src}
              alt={viewedImage.alt}
              width={800}
              height={1000}
              unoptimized
            />
            <p>{viewedImage.alt}</p>
            <a
              className="image-download"
              href={viewedImage.src}
              download={
                viewedImage.src.startsWith("data:")
                  ? "geto-portrait.png"
                  : viewedImage.src.split("/").pop()
              }
            >
              <Download size={15} /> Сохранить изображение
            </a>
          </>
        )}
      </dialog>
    </main>
  );
}
