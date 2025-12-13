// components/visual-stage-host.tsx
"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import VisualStage, { VisualPayload } from "@/components/visual-stage";

export type VisualStageHandle = {
  show: (args: VisualPayload) => void;
  hide: () => void;
  isOpen: () => boolean;
};

type VisualStageHostProps = {
  onActiveChange?: (active: boolean) => void;
  /**
   * Should match your dialog close animation duration.
   * shadcn defaults are usually ~200ms.
   */
  closeAnimationMs?: number;
};

const DEFAULT_CLOSE_MS = 220;

const VisualStageHostInner = forwardRef<VisualStageHandle, VisualStageHostProps>(
  function VisualStageHost({ onActiveChange, closeAnimationMs = DEFAULT_CLOSE_MS }, ref) {
    const [open, setOpen] = useState(false);

    // "payload" is what the stage currently shows.
    // We keep it during close animation and clear after.
    const [payload, setPayload] = useState<VisualPayload | null>(null);

    const clearTimerRef = useRef<number | null>(null);
    const lastActiveRef = useRef<boolean | null>(null);

    const emitActive = useCallback(
      (next: boolean) => {
        if (!onActiveChange) return;
        if (lastActiveRef.current === next) return;
        lastActiveRef.current = next;
        onActiveChange(next);
      },
      [onActiveChange]
    );

    const cancelPendingClear = useCallback(() => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }, []);

    const scheduleClearPayload = useCallback(() => {
      cancelPendingClear();
      clearTimerRef.current = window.setTimeout(() => {
        setPayload(null);
        emitActive(false);
        clearTimerRef.current = null;
      }, closeAnimationMs);
    }, [cancelPendingClear, closeAnimationMs, emitActive]);

    const show = useCallback(
      (args: VisualPayload) => {
        cancelPendingClear();
        setPayload(args);
        setOpen(true);
        emitActive(true);
      },
      [cancelPendingClear, emitActive]
    );

    const hide = useCallback(() => {
      // Close first (let dialog animate). Clear payload later.
      setOpen(false);
      scheduleClearPayload();
    }, [scheduleClearPayload]);

    const isOpen = useCallback(() => open, [open]);

    const handleOpenChange = useCallback(
      (v: boolean) => {
        setOpen((prev) => (prev === v ? prev : v));

        if (v) {
          // Opening: cancel any pending payload clear and mark active
          cancelPendingClear();
          emitActive(true);
        } else {
          // Closing: schedule payload clear after animation
          scheduleClearPayload();
        }
      },
      [cancelPendingClear, emitActive, scheduleClearPayload]
    );

    useImperativeHandle(ref, () => ({ show, hide, isOpen }), [show, hide, isOpen]);

    // If payload becomes non-null while closed, open it (atomic replace flows)
    useEffect(() => {
      if (payload && !open) {
        setOpen(true);
        emitActive(true);
      }
    }, [payload, open, emitActive]);

    // Cleanup
    useEffect(() => {
      return () => cancelPendingClear();
    }, [cancelPendingClear]);

    return (
      <VisualStage
        open={open}
        onOpenChange={handleOpenChange}
        payload={payload}
        onReplace={(next) => {
          cancelPendingClear();
          setPayload(next);
          if (!open) setOpen(true);
          emitActive(true);
        }}
      />
    );
  }
);

// Memoize (props exist now)
const VisualStageHost = React.memo(
  VisualStageHostInner,
  (prev, next) =>
    prev.onActiveChange === next.onActiveChange &&
    prev.closeAnimationMs === next.closeAnimationMs
);

export default VisualStageHost;
