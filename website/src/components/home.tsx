"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  Sparkle,
  X,
} from "lucide-react";
import { Crest } from "./crest";
import { SoundToggle, useExperience } from "./experience-provider";

const invitations = [
  {
    id: "path",
    numeral: "01",
    kanji: "道",
    chapter: "ПУТЬ",
    title: "За пределами видимого",
    description:
      "Ты всегда чувствовал, что мир больше, чем тебе позволяли видеть.",
    image: "/images/shrine.svg",
    detail: "Пробуждение · Личное наставничество",
  },
  {
    id: "power",
    numeral: "02",
    kanji: "力",
    chapter: "СИЛА",
    title: "Природа твоей силы",
    description:
      "Контроль начинается не с власти над другими. Он начинается с тебя.",
    image: "/images/spirit.svg",
    detail: "Потенциал · Искусство контроля",
  },
  {
    id: "truth",
    numeral: "03",
    kanji: "真",
    chapter: "ИСТИНА",
    title: "По ту сторону морали",
    description:
      "Хватит искать правильные ответы. Пора задавать опасные вопросы.",
    image: "/images/silk.svg",
    detail: "Философия · Другой взгляд",
  },
];
const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.8 },
};

export function Home() {
  const { enter } = useExperience();
  const hero = useRef<HTMLElement>(null);
  const credits = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: hero,
    offset: ["start start", "end start"],
  });
  const portraitY = useTransform(
    scrollYProgress,
    [0, 1],
    [0, reduced ? 0 : 110],
  );
  const circleY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 45]);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const x = useSpring(mouseX, { stiffness: 45, damping: 25 });
  const y = useSpring(mouseY, { stiffness: 45, damping: 25 });

  useEffect(() => {
    const element = hero.current;
    if (!element || reduced || !window.matchMedia("(pointer: fine)").matches)
      return;
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      mouseX.set(((event.clientX - rect.left) / rect.width - 0.5) * 18);
      mouseY.set(((event.clientY - rect.top) / rect.height - 0.5) * 10);
    };
    const onLeave = () => {
      mouseX.set(0);
      mouseY.set(0);
    };
    element.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, mouseX, mouseY]);

  function follow(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    enter(href);
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header className="site-header page-width">
        <Link className="wordmark" href="/" aria-label="GETO — главная">
          <Crest />
          <span>
            GETO<small>PRIVATE DOMAIN</small>
          </span>
        </Link>
        <nav aria-label="Главная навигация">
          <a className="nav-active" href="#main">
            Пространство
          </a>
          <a href="#invitations">Приглашения</a>
          <a href="#philosophy">Философия</a>
        </nav>
        <Link
          href="/chat"
          className="header-chat"
          onClick={(e) => follow(e, "/chat")}
        >
          Личный диалог <ArrowUpRight size={16} />
        </Link>
      </header>

      <main id="main">
        <section
          className="hero page-width"
          ref={hero}
          aria-labelledby="hero-title"
        >
          <div className="hero-margin-label">
            <span>呪霊操術</span>
            <i />
            ПО ТУ СТОРОНУ ОБЫДЕННОГО
          </div>
          <div className="hero-copy">
            <motion.div {...reveal} className="eyebrow">
              <span className="gold-dash" />
              ТЫ ЗДЕСЬ НЕ СЛУЧАЙНО
            </motion.div>
            <motion.h1
              {...reveal}
              transition={{ duration: 1, delay: 0.12 }}
              id="hero-title"
            >
              Не каждый
              <br />
              достоин <em>войти.</em>
            </motion.h1>
            <motion.p
              {...reveal}
              transition={{ duration: 1, delay: 0.22 }}
              className="hero-description"
            >
              Мир слишком шумный. Оставь его за дверью.
              <br />
              Здесь имеют значение только твои мысли.
              <br />
              <span>И то, кем ты готов стать.</span>
            </motion.p>
            <motion.div
              {...reveal}
              transition={{ duration: 1, delay: 0.32 }}
              className="hero-actions"
            >
              <Link
                className="primary-button"
                href="/chat"
                onClick={(e) => follow(e, "/chat")}
              >
                <span>Переступить порог</span>
                <ArrowUpRight size={19} />
              </Link>
              <span className="invitation-note">
                <LockKeyhole size={11} /> Только ты и я
              </span>
            </motion.div>
            <motion.div
              {...reveal}
              transition={{ duration: 1, delay: 0.5 }}
              className="hero-signature"
            >
              <span className="signature-line" />
              <div>
                Сугуру Гето<small>Тот, кто видит больше.</small>
              </div>
            </motion.div>
          </div>

          <div className="hero-scene" aria-hidden="true">
            <motion.div className="scene-orbit" style={{ y: circleY }}>
              <div className="orbit-outer" />
              <div className="orbit-inner" />
              <span className="orbit-star star-one">
                <Sparkle size={13} />
              </span>
              <span className="orbit-star star-two">
                <Sparkle size={17} />
              </span>
            </motion.div>
            <div className="scene-kanji">
              夏<br />油<br />傑
            </div>
            <motion.div className="portrait-parallax" style={{ y: portraitY }}>
              <motion.div className="portrait-layer" style={{ x, y }}>
                <Image
                  src="/images/geto.webp"
                  alt=""
                  width={612}
                  height={918}
                  priority
                  sizes="(max-width: 600px) 90vw, 520px"
                  className="hero-portrait"
                />
              </motion.div>
            </motion.div>
            <svg
              className="energy-thread thread-one"
              viewBox="0 0 640 700"
              fill="none"
            >
              <path
                d="M592 14C241 68 667 298 389 435S120 606 8 669"
                stroke="url(#thread)"
                strokeWidth=".7"
              />
              <defs>
                <linearGradient id="thread">
                  <stop stopColor="#5b1d8a" stopOpacity="0" />
                  <stop offset=".5" stopColor="#5b1d8a" stopOpacity=".7" />
                  <stop offset="1" stopColor="#b89b3e" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="scene-haze" />
            <div className="scene-caption">
              <span className="small-cross">+</span>
              <span>
                SUGURU GETO<small>THE WORLD BEYOND THE ORDINARY</small>
              </span>
              <span className="small-cross">+</span>
            </div>
            <div className="floating-dust dust-one" />
            <div className="floating-dust dust-two" />
            <div className="floating-dust dust-three" />
          </div>
          <div className="hero-bottom">
            <a href="#invitations" className="scroll-cue">
              <span className="scroll-stroke" />
              <span>Ниже — твой выбор</span>
              <ArrowDown size={12} />
            </a>
            <SoundToggle />
            <span className="chapter-index">
              序章 <span>/</span> ПРОЛОГ
            </span>
          </div>
        </section>

        <section
          id="invitations"
          className="invitations page-width"
          aria-labelledby="invitations-title"
        >
          <motion.div {...reveal} className="section-heading">
            <div>
              <div className="eyebrow">
                <span className="section-number">01</span> ПРИГЛАШЕНИЯ
              </div>
              <h2 id="invitations-title">
                Выбери, с чего <em>начнём.</em>
              </h2>
            </div>
            <p>
              Это не уроки. Это двери.
              <br />
              За каждой — разговор, который что-то изменит.
            </p>
          </motion.div>
          <div className="doors-grid">
            {invitations.map((invitation, index) => (
              <motion.div
                {...reveal}
                transition={{ duration: 0.7, delay: index * 0.12 }}
                key={invitation.id}
              >
                <Link
                  href={`/chat?invitation=${invitation.id}`}
                  onClick={(e) =>
                    follow(e, `/chat?invitation=${invitation.id}`)
                  }
                  className={`invitation-door door-${invitation.id}`}
                >
                  <Image
                    src={invitation.image}
                    alt=""
                    fill
                    sizes="(max-width: 650px) 100vw, 33vw"
                    className="door-art"
                  />
                  <div className="door-shade" />
                  <div className="door-top">
                    <span>
                      0{index + 1} <i /> {invitation.chapter}
                    </span>
                    <ArrowUpRight size={19} />
                  </div>
                  <span className="door-kanji" aria-hidden="true">
                    {invitation.kanji}
                  </span>
                  <div className="door-content">
                    <p className="door-detail">{invitation.detail}</p>
                    <h3>{invitation.title}</h3>
                    <p className="door-description">{invitation.description}</p>
                    <div className="door-footer">
                      <span>Принять приглашение</span>
                      <ArrowRight size={17} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          <div className="invitations-footnote">
            <span>
              <LockKeyhole size={12} /> У каждого пути своё начало. Собеседник
              всегда один.
            </span>
            <span>ВХОД ПО ВНУТРЕННЕМУ ОТКЛИКУ</span>
          </div>
        </section>

        <section
          className="philosophy page-width"
          id="philosophy"
          aria-labelledby="philosophy-title"
        >
          <motion.div {...reveal} className="philosophy-mark">
            <Crest />
            <span>思想</span>
          </motion.div>
          <motion.div {...reveal} className="philosophy-copy">
            <div className="eyebrow">
              <span className="section-number">02</span> ФИЛОСОФИЯ
            </div>
            <h2 id="philosophy-title">
              «Сильным становится не тот,
              <br />
              кто ничего не боится.
              <br />А тот, кто <em>выбрал свою сторону.</em>»
            </h2>
            <div className="philosophy-bottom">
              <span>Не обещаю, что тебе понравятся мои ответы.</span>
              <Link href="/chat" onClick={(e) => follow(e, "/chat")}>
                Но ты можешь спросить <ArrowUpRight size={15} />
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="site-footer page-width">
        <Link href="/" className="footer-logo">
          <Crest /> GETO<span>Личное пространство. Другие правила.</span>
        </Link>
        <div>
          <button onClick={() => credits.current?.showModal()}>
            Об этом пространстве
          </button>
          <span>© {new Date().getFullYear()} · НЕОФИЦИАЛЬНЫЙ ФАН-ПРОЕКТ</span>
        </div>
      </footer>
      <dialog ref={credits} className="info-dialog">
        <button
          className="icon-button dialog-close"
          onClick={() => credits.current?.close()}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
        <Crest />
        <h2>По ту сторону экрана</h2>
        <p>
          GETO — неофициальное интерактивное пространство по мотивам «Магической
          битвы». Собеседник — ИИ-персонаж, а не реальный человек. Без
          подключения провайдера доступен обозначенный деморежим.
        </p>
        <p>
          Переписка сохраняется в этом браузере. При включённом ИИ текст
          отправляется провайдеру OpenAI для ответа. Не передавай личные данные.
          Историю можно удалить в меню чата.
        </p>
        <p className="credits-note">
          Сугуру Гето и мир Jujutsu Kaisen принадлежат их правообладателям.
          Иллюстрация:{" "}
          <a
            href="https://www.deviantart.com/norm4nsz/art/Suguru-Geto-Render-1002908766"
            target="_blank"
            rel="noreferrer"
          >
            NORM4NSZ / DeviantArt ↗
          </a>
          . Атмосферные иллюстрации созданы для этого пространства. Философская
          цитата — авторская стилизация, не цитата из манги.
        </p>
      </dialog>
    </div>
  );
}
