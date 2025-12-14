"use client";

import React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export default function WidgetSonnerToaster(props: ToasterProps) {
  return (
    <Sonner
      // Keep it near the pill, not over content
      position="bottom-center"
      // Avoid stacking multiple cards in a tiny widget
      visibleToasts={1}
      // Don’t expand into a tall stack
      expand={false}
      // Give breathing room from viewport edge (pill sits at bottom)
      offset={72}
      // Slightly tighter spacing
      gap={8}
      // No close button in widget (too “UI heavy”)
      closeButton={false}
      // class target from widget.css only
      className="toaster sm-widget-toaster"
      toastOptions={{
        duration: 2200,
        // Keep it from hijacking clicks around the pill
        style: { pointerEvents: "none" },
      }}
      {...props}
    />
  );
}
