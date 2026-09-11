"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { Crest } from "./crest";

const ExperienceContext = createContext<{
  enter: (href: string) => void;
  sound: boolean;
  toggleSound: () => void;
}>({ enter: () => {}, sound: false, toggleSound: () => {} });
export const useExperience = () => useContext(ExperienceContext);

export function ExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [transitioning, setTransitioning] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entering = useRef(false);

  useEffect(() => {
    if (!entering.current) return;
    const id = setTimeout(() => {
      setTransitioning(false);
      entering.current = false;
    }, 200);
    return () => clearTimeout(id);
  }, [pathname]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void audio.current?.close();
    },
    [],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void audio.current?.suspend();
      else if (sound) void audio.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sound]);

  const toggleSound = useCallback(() => {
    if (!audio.current) {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = 0.018;
      gain.connect(context.destination);
      [73.42, 110, 146.92].forEach((frequency) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
      });
      audio.current = context;
    }
    if (sound) void audio.current.suspend();
    else void audio.current.resume();
    setSound(!sound);
  }, [sound]);

  const enter = useCallback(
    (href: string) => {
      if (entering.current) return;
      if (reducedMotion) {
        router.push(href);
        return;
      }
      entering.current = true;
      setTransitioning(true);
      timer.current = setTimeout(() => {
        router.push(href);
        timer.current = setTimeout(() => {
          setTransitioning(false);
          entering.current = false;
        }, 4000);
      }, 560);
    },
    [router, reducedMotion],
  );

  return (
    <ExperienceContext.Provider value={{ enter, sound, toggleSound }}>
      <MotionConfig reducedMotion="user">
        {children}
        <AnimatePresence>
          {transitioning && (
            <motion.div
              className="threshold"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="threshold-line" />
              <Crest />
              <span>Тише. Ты уже близко.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </ExperienceContext.Provider>
  );
}

export function SoundToggle({ compact = false }: { compact?: boolean }) {
  const { sound, toggleSound } = useExperience();
  return (
    <button
      className="sound-toggle"
      type="button"
      onClick={toggleSound}
      aria-pressed={sound}
      aria-label={
        sound ? "Выключить атмосферный звук" : "Включить атмосферный звук"
      }
    >
      {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
      <span>
        {compact
          ? sound
            ? "Звук включён"
            : "Звук выключен"
          : sound
            ? "Атмосфера включена"
            : "Включить атмосферу"}
      </span>
      <i className={sound ? "sound-bars playing" : "sound-bars"}>
        <b />
        <b />
        <b />
        <b />
      </i>
    </button>
  );
}
