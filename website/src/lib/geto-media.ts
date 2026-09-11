import type { CHAT_MEDIA } from "./chat";
import type { ChatInput } from "./server-chat";

const imageWords =
  /портрет|фот[ооку]|фоточ|картин|изображ|селфи|кубик|пресс|торс|храм|дух|себя|свой мир|убежищ|\b(?:image|picture|portrait|selfie|abs|yourself)\b/iu;
const imageVerb =
  /покажи|нарисуй|создай|сгенерируй|пришли|отправь|скинь|скидывай|сбрось|дай|хочу|можно|\b(?:draw|generate|show|send)\b/iu;
const again =
  /^(?:а\s+)?(?:ещ[её]|друг(?:ое|ую)|повтори|another|one more)[\s.!?,]*(?:пожалуйста)?[.!?]*$/iu;
const noImage =
  /(?:не\s+(?:надо\s+)?(?:показывай|рисуй|создавай|присылай|отправляй|скидывай)|без\s+(?:фото|картин|изображ)|не\s+надо.{0,20}(?:фото|картин|изображ))/iu;

function directImageRequest(text: string): boolean {
  return (
    !noImage.test(text) &&
    ((imageWords.test(text) && imageVerb.test(text)) ||
      /^(?:ещ[её]\s+)?(?:фото|фотку|селфи|портрет|картинку|selfie)[\s.!?]*$/iu.test(
        text,
      ))
  );
}

export function imageRequestText(input: ChatInput): string {
  const last = input.messages.at(-1)!.content;
  if (!again.test(last)) return last;
  const previous = input.messages
    .slice(0, -1)
    .filter((turn) => turn.role === "user")
    .at(-1);
  return previous && directImageRequest(previous.content)
    ? previous.content
    : last;
}

export function imageIntent(input: ChatInput): boolean {
  const last = input.messages.at(-1)!.content;
  return (
    !noImage.test(last) &&
    (input.requestImage === true || directImageRequest(imageRequestText(input)))
  );
}

export function chooseMedia(input: ChatInput): keyof typeof CHAT_MEDIA {
  const content = imageRequestText(input);
  if (/храм|святил|убежищ|свой мир|temple|shrine/iu.test(content))
    return "shrine";
  if (/дух|проклят|энерг|spirit|curse/iu.test(content)) return "spirit";
  return "portrait";
}

export function customPortraitRequested(input: ChatInput): boolean {
  return (
    chooseMedia(input) === "portrait" &&
    /кубик|пресс|торс|без\s+(?:футболк|рубашк)|накач|мускул|атлет|трениров|костюм|пиджак|улыб|профил|сбоку|нов(?:ый|ое|ую)|друг(?:ой|ое|ую)|ещ[её]|abs|shirtless|suit|smil|profile/iu.test(
      input.messages.at(-1)!.content + " " + imageRequestText(input),
    )
  );
}

export function portraitDirection(input: ChatInput): string {
  const request = imageRequestText(input);
  const turn = input.messages.filter(
    (message) => message.role === "user",
  ).length;
  const shirtless =
    /кубик|пресс|торс|без\s+(?:футболк|рубашк)|abs|shirtless/iu.test(request);
  const outfit = shirtless
    ? "Shirtless adult athlete after training, defined abdominal muscles, black training trousers securely covering hips and groin, a towel over one shoulder. Nonsexual sports editorial, relaxed standing pose, framed from head to waist"
    : /накач|мускул|атлет|трениров/iu.test(request)
      ? "Wearing a fitted fully covering black training shirt, athletic muscular adult build"
      : /костюм|пиджак|suit/iu.test(request)
        ? "Wearing an impeccably tailored black suit"
        : turn % 2
          ? "Wearing traditional flowing black robes"
          : "Wearing a dark silk kimono";
  const angle = /профил|сбоку|profile/iu.test(request)
    ? "elegant side profile"
    : shirtless || turn % 2
      ? "three-quarter waist-up composition"
      : "head-and-shoulders composition";
  const mood = /улыб|сме[хй]|smil/iu.test(request)
    ? "a subtle knowing smile"
    : "a calm, quietly commanding expression";
  return `${outfit}. ${angle}, ${mood}. Geto himself, not Kenjaku: no forehead stitches. No genital nudity, no sexual pose.`;
}
