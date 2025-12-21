"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CatalogResults({ items, compact }: { items?: any[]; compact?: boolean }) {
  const count = Array.isArray(items) ? items.length : 0;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      setShowFade(overflow && !atBottom);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", update as any);
      ro.disconnect();
    };
  }, [count]);

  return (
    <Card className="bg-neutral-900 border-neutral-800 w-full flex flex-col max-h-[65dvh] sm:max-h-[360px]">
      <CardHeader className={compact ? "px-4 py-3" : undefined}>
        <CardTitle className="text-base sm:text-lg">Catalog Results</CardTitle>
        <CardDescription className="text-xs sm:text-sm text-neutral-400">
          Found {count} item{count === 1 ? "" : "s"}. Ask to filter or show details.
        </CardDescription>
      </CardHeader>

      <CardContent className={(compact ? "px-4 pt-0 pb-4 " : "") + "flex-1 min-h-0"}>
        <div className="relative h-full min-h-0">
          <ScrollArea
            hideScrollbar
            className="h-full pr-2"
            // ✅ attach the ref to the viewport using a wrapper div
            viewportClassName="relative"
          >
            {/* viewportRef needs to point at the actual scrolling element:
                Radix Viewport is the scroller, so we put a div inside and find its parent.
                Easiest: put ref on a full-height child and use closest() in effect? too much.
                Better: wrap ScrollArea to expose viewport ref (optional).
                
                Simpler approach: put an element as first child and use parentElement in a layout effect.
            */}
            <ViewportRefBridge onViewport={(v) => (viewportRef.current = v)} />

            <div className="grid gap-3">
              {count === 0 ? (
                <div className="text-sm text-neutral-400">No items to display.</div>
              ) : (
                items!.map((it: any, i: number) => (
                  <Card key={i} className="bg-neutral-950 border-neutral-800">
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-medium text-neutral-100 truncate">
                            {it.title || it.name || it.id || `Item ${i + 1}`}
                          </div>
                          {it.type ? <div className="text-xs sm:text-sm text-neutral-400 mt-0.5">{it.type}</div> : null}
                          {it.description ? (
                            <div className="text-xs sm:text-sm text-neutral-400 mt-1 line-clamp-2">{it.description}</div>
                          ) : null}
                        </div>

                        {Array.isArray(it.tags) ? (
                          <div className="flex flex-wrap gap-1 shrink-0 max-w-[50%] sm:max-w-none">
                            {it.tags.map((t: string) => (
                              <Badge key={t} variant="secondary" className="bg-neutral-800 text-neutral-300">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {showFade && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-neutral-900" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tiny helper that grabs the Radix Viewport DOM node (the real scroller)
 * without changing your ScrollArea API further.
 */
function ViewportRefBridge({ onViewport }: { onViewport: (el: HTMLDivElement | null) => void }) {
  const markerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    // Radix Viewport is the closest ancestor with data-radix-scroll-area-viewport
    const viewport = marker.closest('[data-radix-scroll-area-viewport=""]') as HTMLDivElement | null;
    onViewport(viewport);

    return () => onViewport(null);
  }, [onViewport]);

  return <div ref={markerRef} />;
}
