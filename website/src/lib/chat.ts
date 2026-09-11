export type ChatImage = { src: string; alt: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  image?: ChatImage;
};

export const GREETING = "Привет. Ты хотел что-то?";

export const greeting = GREETING;

export const CHAT_MEDIA = {
  portrait: {
    src: "/images/geto.webp",
    alt: "Сугуру Гето: портрет персонажа",
  },
  shrine: {
    src: "/images/shrine.svg",
    alt: "Тихий храм в сумерках",
  },
  spirit: {
    src: "/images/spirit.svg",
    alt: "Силуэт проклятого духа в вихре энергии",
  },
} satisfies Record<string, ChatImage>;
