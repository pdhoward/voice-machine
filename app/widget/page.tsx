// app/widget/page.tsx
import { Suspense } from "react";
import WidgetPageClient from "./WidgetPageClient";

export default function WidgetPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm h-[420px] flex items-center justify-center bg-neutral-950 text-neutral-400 rounded-t-2xl">
          Loading voice agent…
        </div>
      }
    >
      <WidgetPageClient />
    </Suspense>
  );
}
