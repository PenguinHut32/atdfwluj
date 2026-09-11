import Link from "next/link";
import { Crest } from "@/components/crest";
export default function NotFound() {
  return (
    <main className="empty-page">
      <Crest />
      <span className="eyebrow">404 · ЗАКРЫТАЯ ДВЕРЬ</span>
      <h1>Не все пути ведут ко мне.</h1>
      <p>Этого пространства не существует. Вернись туда, где тебя ждут.</p>
      <Link className="primary-button" href="/">
        Вернуться к порогу ↗
      </Link>
    </main>
  );
}
