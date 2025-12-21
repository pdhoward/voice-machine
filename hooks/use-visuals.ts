"use client";

/**
 * use-visuals.ts
 * 
 * App → RealtimeProvider → WebRTCClient → this hook → VisualStageHost
 *
 * This hook exposes a single function, `visualFunction`, that is registered as
 * the implementation of the **show_component** tool.
 *
 * High-level pipeline:
 *
 *   1. A user talks/texts → the Realtime model decides to call the tool
 *      `show_component` with some JSON args.
 *
 *   2. In `RealtimeProvider`, `WebRTCClient` receives that tool call and
 *      dispatches it to a JS function that was registered via:
 *
 *         registerFunction("show_component", visualFunction)
 *
 *   3. That registration happens in `app/(web)/page.tsx`:
 *
 *         const visualFunction = useVisualFunctions({ stageRef });
 *         ...
 *         Object.entries(visualFunction).forEach(([localName, fn]) => {
 *           const toolName = nameMap[localName]; // "show_component"
 *           registerFunction(toolName, fn);
 *         });
 *
 *   4. When the tool is invoked, the model-supplied args arrive here as `args`.
 *      This hook:
 *         - parses / normalizes the args (JSON, media, etc.)
 *         - auto-routes to a specific visual component if needed
 *         - validates the payload via Zod
 *         - finally calls `stageRef.current.show(payload)` to render
 *           the correct visual in `VisualStageHost`.
 *
 *   5. `VisualStageHost` (wired to the same `stageRef` in `page.tsx`) receives
 *      the payload and passes it into `VisualStage`, which then lazy-loads the
 *      appropriate React component via the visuals registry.
 *
 * This hook is therefore the **only entry point** for tool-driven visuals:
 * every LLM `show_component` request flows through this function.
 */

import { useRef } from "react";
import { z } from "zod";
import type { VisualStageHandle } from "@/components/visual-stage-host";

import {
  VISUAL_COMPONENTS,
  INTENT_TO_COMPONENT,
  type VisualName,
  type VisualIntent,
} from "@/types/manifest";

/* =========================================================================
   Visuals Hook — hardened
   - Single Zod schema with per-component refines
   - Deterministic autoRoute() that always sets component_name
   - Fail-soft fallback for media_gallery so UX never stalls
   ======================================================================= */

// ----------------------------- Helpers -----------------------------------

const VIDEO_EXTS = new Set(["mp4", "webm", "m4v", "mov", "ogg"]);

function looksLikeVideo(src?: string) {
  if (!src) return false;
  const q = src.split("?")[0];
  const ext = q.split(".").pop()?.toLowerCase();
  return !!ext && VIDEO_EXTS.has(ext);
}

const asArray = <T,>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

/**
 * Best-effort JSON parsing used to handle cases where the tool
 * args are stringified JSON (common from tool schemas or LLM output).
 */
function tryParseJSON<T = unknown>(v: any): T | any {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      /* ignore */
    }
  }
  return v;
}

function isAbsoluteHttpsUrl(url?: string) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

// ------------------------- Schema (single) --------------------------------
// This schema is the *canonical* payload contract for visuals. Everything
// the model/tool passes must conform to this shape after `autoRoute`.

const ImageItem = z
  .object({
    kind: z.literal("image"),
    src: z.string().url(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .strict();

const VideoItem = z
  .object({
    kind: z.literal("video"),
    src: z.string().url(),
    poster: z.string().url().optional(),
    // allow alt on video as a caption/label if you use it in UI
    alt: z.string().optional(),
  })
  .strict();

const VisualMediaItem = z.discriminatedUnion("kind", [ImageItem, VideoItem]);
type TMediaItem = z.infer<typeof VisualMediaItem>;

export const VisualPayloadSchema = z
  .object({
    // 🔑 component_name is tied to VISUAL_COMPONENTS from the manifest
    component_name: z.enum(
      VISUAL_COMPONENTS as [VisualName, ...VisualName[]]
    ),
    title: z.string().optional(),
    description: z.string().optional(),
    size: z.enum(["sm", "md", "lg", "xl"]).optional(),
    url: z.string().url().optional(),
    props: z.record(z.any()).optional(),
    media: z.array(VisualMediaItem).optional(),
  })
  .strict()
  // Per-component rules (small, predictable constraints):
  .refine(
    (p) =>
      p.component_name !== "media_gallery" ||
      (Array.isArray(p.media) && p.media.length > 0),
    {
      message: "media_gallery requires media[] with at least one item",
      path: ["media"],
    }
  )
  .refine(
    (p) =>
      p.component_name !== "video" ||
      (Array.isArray(p.media) &&
        p.media.length === 1 &&
        p.media[0]?.kind === "video"),
    {
      message: "video requires exactly one video item in media[]",
      path: ["media"],
    }
  )
  .refine(
    (p) =>
      p.component_name !== "image_viewer" ||
      (Array.isArray(p.media) &&
        p.media.length === 1 &&
        p.media[0]?.kind === "image"),
    {
      message: "image_viewer requires exactly one image item in media[]",
      path: ["media"],
    }
  );

// ----------------------- Normalization helpers ----------------------------

/**
 * Normalizes arbitrary input into a list of VisualMediaItem objects.
 * Accepts:
 *   - string URLs
 *   - objects with { url | src }
 *   - mixed arrays
 * and filters to HTTPS URLs only.
 */
function coerceMedia(input: any): TMediaItem[] {
  const raw = asArray(tryParseJSON(input));
  const out: TMediaItem[] = [];
  for (const i of raw) {
    if (!i) continue;
    const src: string | undefined =
      typeof i === "string" ? i : i.url ?? i.src ?? undefined;
    if (!src) continue;

    // Keep absolute HTTPS only — prevents surprises at render
    if (!isAbsoluteHttpsUrl(src)) continue;

    if (looksLikeVideo(src)) {
      out.push({ kind: "video", src, poster: i.poster, alt: i.alt ?? "" });
    } else {
      out.push({
        kind: "image",
        src,
        alt: i.alt ?? "",
        width: i.width,
        height: i.height,
      });
    }
  }
  return out;
}

/**
 * autoRoute:
 *   - takes raw tool args from the agent
 *   - normalizes `media`
 *   - optionally infers `component_name` from an `intent` hint
 *   - guarantees that `component_name` is always set
 *
 * This is where “abstract” tool calls like:
 *   { intent: "room", media: [...] }
 * are converted into a concrete visual, e.g.:
 *   { component_name: "room", media: [...] }
 */
function autoRoute(input: any) {
  const p: any = { ...input };

  // 1) Normalize media (works for top-level or props.media)
  const media = coerceMedia(p.media ?? p.props?.media);
  if (media.length) {
    p.media = media;
    p.props = { ...(p.props || {}), media };
  }

  // 2) ⬇️ intent hints (only if component_name is missing)
  //    INTENT_TO_COMPONENT is derived from the manifest,
  //    so adding a new intent/component lives in one place.
  if (!p.component_name && typeof p.intent === "string") {
    const intent = p.intent as VisualIntent;
    const mapped = INTENT_TO_COMPONENT[intent];
    if (mapped) {
      p.component_name = mapped;
    }
  }

  // 3) Strip intent before validation (prevents Zod unrecognized_keys)
  if ("intent" in p) delete p.intent;

  // 4) Always guarantee a component_name
  //    If the agent didn't specify anything explicit, we choose a
  //    sensible default based on media.
  if (!p.component_name) {
    if (media.length > 1) p.component_name = "media_gallery";
    else if (media.length === 1)
      p.component_name = media[0].kind === "video" ? "video" : "image_viewer";
    else p.component_name = "catalog_results";
  }

  return p;
}

// ------------------------------- Hook -------------------------------------

type Props = { stageRef: React.RefObject<VisualStageHandle | null> };

/**
 * useVisualFunctions
 *
 * Usage:
 *   const { visualFunction } = useVisualFunctions({ stageRef });
 *   registerFunction("show_component", visualFunction);
 *
 * The realtime client calls `visualFunction(args)` whenever the model
 * invokes the `show_component` tool. This hook:
 *   - logs calls for debugging
 *   - parses / normalizes tool args
 *   - auto-routes to a concrete component
 *   - validates with Zod
 *   - delegates to `stageRef.current.show(payload)` for rendering.
 */
export const useVisualFunctions = ({ stageRef }: Props) => {
  // Simple call counter to help track multiple calls in dev/debug.
  const callCountRef = useRef(0);

  /**
   * visualFunction
   *
   * Tool implementation for "show_component".
   * Signature must match what `registerFunction` expects:
   *   (args: any) => Promise<{ ok: boolean; ... }>
   */
  const visualFunction = async (args: any) => {
    console.groupCollapsed("[show_component] incoming args");
    console.log(args);
    console.groupEnd();

    // DEBUG: Add a counter to distinguish calls
    callCountRef.current++;
    console.log(
      `[show_component] CALL ${callCountRef.current} with incoming arg: ${args}`
    );

    // 1) Parse + normalize stringified fields
    const raw = {
      ...(args || {}),
      media: tryParseJSON(args?.media),
      url: tryParseJSON(args?.url),
      props: {
        ...(tryParseJSON(args?.props) || {}),
        media: tryParseJSON(args?.props?.media),
        url: tryParseJSON(args?.props?.url),
      },
    };

    // 2) Auto-route to the right component and guarantee component_name
    const routed = autoRoute(raw);
    console.log("[show_component] routed", routed);

    // 3) Validate against the single schema
    const parsed = VisualPayloadSchema.safeParse(routed);
    
    if (!parsed.success) {
      console.error("[show_component] zod error", parsed.error);

      // --- Fail-soft fallback: if it's obviously renderable as a gallery, show it ---
      const media = Array.isArray(routed?.media) ? routed.media : [];
      const looksRenderable =
        routed?.component_name === "media_gallery" &&
        media.length > 0 &&
        media.every(
          (m: any) =>
            m?.src &&
            typeof m.src === "string" &&
            m.src.startsWith("https://") &&
            (m.kind === "image" || m.kind === "video")
        );

      if (looksRenderable) {
        const fallback = {
          ...routed,
          component_name: "media_gallery",
          props: { ...(routed.props || {}), media },
        };
        console.warn(
          "[show_component] using safe fallback render for media_gallery"
        );
        stageRef.current?.show(fallback);
        return {
          ok: true,
          routed_component: "media_gallery",
          warning: "zod_failed_fallback_rendered",
        };
      }

      // Hard error path (feeds the agent a precise fix)
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return {
        ok: false,
        error: "schema_violation",
        why: "Your tool arguments didn’t match the schema.",
        fix: {
          summary: "Recall show_component with a valid VisualPayload.",
          minimal_example: {
            component_name: "media_gallery",
            media: [
              {
                kind: "image",
                src: "https://res.cloudinary.com/stratmachine/image/upload/v1759170503/cypress/outdoorshower_pt4q3n.jpg",
              },
            ],
          },
          must: [
            "Populate media[].src with working, absolute HTTPS URLs.",
            "Derive media from the Unit document’s images array.",
            "If you don't have the Unit, first call compose_media_payload(tenantId, unitId) or fetch /api/booking/{tenantId}/rooms?active=true and use the matching unit.",
            "Do NOT use placeholders like 'https://...'.",
          ],
        },
        issues,
      };
    }

    const payload = parsed.data as any;

    console.log(
      `[show_component] CALL ${callCountRef.current} NEAR LOGIC END with component: ${payload.component_name}`
    );

    // 4) Mirror top-level → props for components that only read props
    //    This keeps older visuals working even if they only look at props.
    payload.props = { ...(payload.props || {}) };
    if (payload.media && !payload.props.media)
      payload.props.media = payload.media;
    if (payload.url && !payload.props.url) payload.props.url = payload.url;
    if (payload.title && !payload.props.title) payload.props.title = payload.title;
    if (payload.description && !payload.props.description)
      payload.props.description = payload.description;

    console.log("[show_component] normalized + routed payload", {
      component: payload.component_name,
      mediaLen: Array.isArray(payload.media) ? payload.media.length : 0,
      payload,
    });

    // 5) before calling show(), add a hard guard for clarity
    //    If the stage isn't mounted yet, don't crash the agent/tool.
    const target = stageRef?.current;
    if (!target || typeof target.show !== "function") {
      console.error("[show_component] stage not ready", {
        hasRef: !!stageRef,
        hasCurrent: !!stageRef?.current,
      });
      return { ok: false, error: "stage_not_ready" };
    }

    // 🔚 Final step: render on the stage.
    // This ultimately drives VisualStageHost & VisualStage, which in turn
    // load the concrete React visual (room, media_gallery, etc.)
    target.show(payload);

    return { ok: true, routed_component: payload.component_name };
  };

  // The hook returns an object so we can easily extend with more
  // visual-related functions later if needed.
  // In app/page.tsx, we map `visualFunction` -> "show_component" tool.
  return {
    visualFunction,
  };
};
