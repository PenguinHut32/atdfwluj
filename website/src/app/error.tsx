"use client";
import { useEffect } from "react";
import { Crest } from "@/components/crest";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    document.title = "Тишина прервалась | GETO";
  }, []);
  return (
    <main className="empty-page">
      <Crest />
      <h1>Тишина прервалась.</h1>
      <p>Не удалось открыть пространство. Попробуй ещё раз.</p>
      <button className="primary-button" onClick={reset}>
        Попробовать снова ↗
      </button>
    </main>
  );
}
