import type { Metadata } from "next";
import { Suspense } from "react";
import { Messenger } from "@/components/messenger";
import { Crest } from "@/components/crest";
export const metadata: Metadata = { title: "Личный диалог" };
export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="empty-page">
          <Crest />
          <p>За дверью тихо.</p>
        </div>
      }
    >
      <Messenger />
    </Suspense>
  );
}
