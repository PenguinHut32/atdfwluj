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
import {
  CHAT_MEDIA,
  GREETING,
  type ChatMessage,
  type ChatStyle,
} from "@/lib/chat";
import { messageTextParts } from "@/lib/message-text";
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

const conversationStyles: { value: ChatStyle; label: string }[] = [
  { value: "natural", label: "Как пойдёт" },
  { value: "banter", label: "Подколы" },
  { value: "flirt", label: "Флирт" },
  { value: "roleplay", label: "Сцена" },
];
const stylePrompts: Record<Exclude<ChatStyle, "natural">, string[]> = {
  banter: [
    "Всегда такой самоуверенный?",
    "Спорим, я тебя рассмешу?",
    "У тебя и на выходных этот серьёзный вид?",
  ],
  flirt: [
    "Ты со всеми так смотришь или мне повезло?",
    "Составишь мне компанию за чаем?",
    "Кажется, я здесь не только ради разговора.",
  ],
  roleplay: [
    "*Захожу в храм после тренировки* У тебя найдётся чай?",
    "*Сажусь рядом на ступенях* Не помешаю?",
    "*Протягиваю зонт* Прогуляемся под дождём?",
  ],
};
const portraitPrompts = [
  {
    label: "После тренировки",
    prompt: "Покажи фото после тренировки с кубиками пресса, без футболки.",
  },
  { label: "В костюме", prompt: "Покажи свой портрет в строгом костюме." },
  { label: "С улыбкой", prompt: "Покажи свой портрет с лёгкой улыбкой." },
  { label: "В профиль", prompt: "Покажи свой портрет в профиль." },
];
const disclosureKey = (mode: "live" | "demo") => `geto-disclosure-v1-${mode}`;

function highlight(text: string, query: string) {
  return messageTextParts(text, query).map((part, index) => {
    const content = part.highlighted ? <mark>{part.text}</mark> : part.text;
    return part.action ? (
      <em key={index}>{content}</em>
    ) : (
      <span key={index}>{content}</span>
    );
  });
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
  const [style, setStyle] = useState<ChatStyle>("natural");
  const [acknowledgedMode, setAcknowledgedMode] = useState<
    "live" | "demo" | null
  >(null);
  const acknowledgedModes = useRef(new Set<"live" | "demo">());
  const needsDisclosure =
    (mode === "live" || mode === "demo") && acknowledgedMode !== mode;
  const canSend =
    ready && !busy && (mode === "live" || mode === "demo") && !needsDisclosure;
  const about = useRef<HTMLDialogElement>(null);
  const aboutButton = useRef<HTMLButtonElement>(null);
  const mediaButton = useRef<HTMLButtonElement>(null);
  const imageReturnFocus = useRef<HTMLButtonElement | null>(null);
  const prompts =
    style === "natural"
      ? openingPrompts[selectedInvitation || "default"]
      : stylePrompts[style];
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

  function updateMode(nextMode: "live" | "demo") {
    let acknowledged = acknowledgedModes.current.has(nextMode);
    try {
      acknowledged ||=
        sessionStorage.getItem(disclosureKey(nextMode)) === "accepted";
    } catch {
      // In-memory acknowledgement keeps the chat usable when storage is blocked.
    }
    setAcknowledgedMode(acknowledged ? nextMode : null);
    setMode(nextMode);
  }

  function acknowledge() {
    if (mode !== "live" && mode !== "demo") return;
    acknowledgedModes.current.add(mode);
    setAcknowledgedMode(mode);
    try {
      sessionStorage.setItem(disclosureKey(mode), "accepted");
    } catch {
      // The current page still remembers consent without browser storage.
    }
    about.current?.close();
    requestAnimationFrame(() => composer.current?.focus());
  }

  function openAbout() {
    setMenu(null);
    aboutButton.current?.focus();
    about.current?.showModal();
  }

  useEffect(() => {
    if (needsDisclosure) about.current?.showModal();
  }, [needsDisclosure, mode]);

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
        if (data.mode !== "live" && data.mode !== "demo") throw new Error();
        updateMode(data.mode);
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
    if (
      !text ||
      busyLock.current ||
      !canSend ||
      text.length > 6000 ||
      (requestImage && !imageGeneration)
    )
      return;
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
          style,
          expectedMode: mode,
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
      updateMode(data.mode === "live" ? "live" : "demo");
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
    mode === "offline"
      ? "Связь недоступна"
      : mode === "loading"
        ? "Соединение…"
        : "Личный диалог";

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
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    disabled={!canSend}
                    onClick={() => void send(prompt)}
                  >
                    {prompt}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="composer-area">
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
          <div
            className="conversation-styles"
            role="group"
            aria-label="Настроение разговора"
          >
            {conversationStyles.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={style === option.value}
                disabled={!canSend}
                onClick={() => setStyle(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
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
                ref={mediaButton}
                aria-label="Попросить изображение"
                disabled={
                  busy || !ready || needsDisclosure || mode === "loading"
                }
                aria-expanded={menu === "media"}
                onClick={() => setMenu(menu === "media" ? null : "media")}
              >
                <ImagePlus size={22} />
              </button>
              {menu === "media" && (
                <div className="chat-popover media-popover">
                  <small>НОВЫЙ ПОРТРЕТ</small>
                  {portraitPrompts.map(({ label, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!canSend || !imageGeneration}
                      aria-describedby={
                        !imageGeneration ? "portraits-unavailable" : undefined
                      }
                      onClick={() => void send(prompt, true)}
                    >
                      <ImagePlus size={15} /> {label}
                    </button>
                  ))}
                  {!imageGeneration && (
                    <>
                      <p
                        id="portraits-unavailable"
                        className="media-unavailable"
                      >
                        Новые портреты сейчас недоступны. Можно открыть
                        изображения из галереи ниже.
                      </p>
                      <button type="button" onClick={openAbout}>
                        <Info size={15} /> О чате
                      </button>
                    </>
                  )}
                  <small>ГАЛЕРЕЯ</small>
                  {(
                    [
                      ["Портрет Гето", CHAT_MEDIA.portrait],
                      ["Убежище", CHAT_MEDIA.shrine],
                      ["Проклятая энергия", CHAT_MEDIA.spirit],
                    ] as const
                  ).map(([label, image]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        imageReturnFocus.current = mediaButton.current;
                        setViewedImage(image);
                        setMenu(null);
                      }}
                    >
                      <ImagePlus size={15} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              ref={composer}
              value={draft}
              disabled={!canSend}
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
                disabled={!canSend}
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
              disabled={!draft.trim() || !canSend}
            >
              <Send size={19} />
            </button>
          </form>
          <div className="composer-footnote">
            <button
              type="button"
              ref={aboutButton}
              className="about-chat-button"
              onClick={openAbout}
            >
              <Info size={13} /> О чате
            </button>
            {needsDisclosure && <span>Перед разговором открой «О чате».</span>}
            <span className="enter-tip">
              {draft.length > 5500
                ? `${draft.length} / 6000`
                : "Enter — отправить"}
            </span>
          </div>
        </div>
      </section>

      <dialog
        ref={about}
        className="info-dialog about-dialog"
        aria-labelledby="about-chat-title"
        onCancel={(event) => {
          if (needsDisclosure) event.preventDefault();
        }}
      >
        {!needsDisclosure && (
          <button
            className="icon-button dialog-close"
            aria-label="Закрыть информацию о чате"
            onClick={() => about.current?.close()}
          >
            <X size={20} />
          </button>
        )}
        <span className="eyebrow">ПЕРЕД РАЗГОВОРОМ</span>
        <h2 id="about-chat-title" tabIndex={-1} autoFocus>
          О чате
        </h2>
        <p>
          Это фанатская художественная интерпретация взрослого Сугуру Гето, а не
          реальный человек. Подколы, лёгкий флирт и сцены остаются вымыслом.
        </p>
        <p className="about-mode" role="status">
          {mode === "demo"
            ? "Сейчас включён демонстрационный режим: ответы заранее написаны и выбираются по сценарию. ИИ не подключён; текст отправляется серверу проекта, но не передаётся OpenAI."
            : mode === "live"
              ? "Сейчас включён ИИ-диалог: ответы создаёт модель OpenAI. При отправке текст текущей переписки передаётся нашему серверу и OpenAI для ответа; запросы новых изображений также обрабатывает OpenAI."
              : mode === "offline"
                ? "Не удалось проверить доступность чата. Отправка отключена. Обнови страницу, чтобы проверить соединение снова."
                : "Проверяем доступность чата. До завершения проверки отправка отключена."}
        </p>
        <p>
          Не отправляй чувствительные или личные данные. История текста
          сохраняется в этом браузере, если его настройки позволяют; её можно
          скачать или удалить через меню диалога.
        </p>
        <p>
          {imageGeneration
            ? "Новые портреты создаются по запросу и могут отличаться от канона. Созданные иллюстрации доступны до закрытия страницы: сохраняй их отдельно через просмотр изображения."
            : "Создание новых портретов сейчас недоступно. Галерея содержит готовые изображения, а не новые фото по твоему запросу."}
        </p>
        <p>
          Описание режима и обработки данных всегда доступно здесь, по кнопке «О
          чате».
        </p>
        {needsDisclosure ? (
          <div className="about-actions">
            <button className="primary-button" onClick={acknowledge}>
              Начать разговор
            </button>
            <Link href="/">Вернуться за порог</Link>
          </div>
        ) : (
          <button
            className="primary-button"
            onClick={() => about.current?.close()}
          >
            Вернуться к разговору <ArrowLeft size={16} />
          </button>
        )}
      </dialog>
      <dialog
        ref={profile}
        className="info-dialog profile-dialog"
        aria-labelledby="geto-profile-title"
      >
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
        <h2 id="geto-profile-title">Сугуру Гето</h2>
        <blockquote>
          «Не бойся тишины.
          <br />В ней слышно самое важное.»
        </blockquote>
        <div className="profile-details">
          <span>
            ВОЗРАСТ<strong>27 лет</strong>
          </span>
          <span>
            ПУТЬ<strong>Бывший маг. Свою сторону я уже выбрал.</strong>
          </span>
          <span>
            ТЕХНИКА<strong>Манипуляция проклятыми духами.</strong>
          </span>
        </div>
        <p>
          Чай, тишина и собеседник, который не боится возразить. Для начала
          вполне достаточно. Только не жди, что я во всём соглашусь.
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
        onClose={() => {
          setViewedImage(null);
          imageReturnFocus.current?.focus();
          imageReturnFocus.current = null;
        }}
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
            <p>
              {viewedImage.alt}
              <br />
              <span className="image-origin">
                {viewedImage.src.startsWith("data:")
                  ? "Созданная иллюстрация"
                  : "Из галереи"}
              </span>
            </p>
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
