// components/visuals/manifest.ts
export type VisualName =
  | "quote_summary"
  | "catalog_results"
  | "reservation_checkout"
  | "room"
  | "video"
  | "image_viewer"
  | "media_gallery";

export type VisualIntent =
  | "quote"
  | "reservation_checkout"
  | "room"
  | "media"
  | "video"
  | "image";
// 👆 notice: no "results" any more

type VisualDef = {
  name: VisualName;
  hasOwnChrome?: boolean;
  intents?: VisualIntent[];
};

export const VISUAL_DEFS: VisualDef[] = [
  {
    name: "quote_summary",
    hasOwnChrome: true,
    intents: ["quote"],
  },
  {
    name: "catalog_results",
    hasOwnChrome: true,
    // no intents → can’t be reached by intent
  },
  {
    name: "reservation_checkout",
    hasOwnChrome: true,
    intents: ["reservation_checkout"],
  },
  {
    name: "room",
    hasOwnChrome: true,
    intents: ["room"],
  },
  {
    name: "media_gallery",
    hasOwnChrome: true,
    intents: ["media"],
  },
  {
    name: "image_viewer",
    hasOwnChrome: true,
    intents: ["image"],
  },
  {
    name: "video",
    hasOwnChrome: true,
    intents: ["video"],
  },
];

// All component names
export const VISUAL_COMPONENTS = VISUAL_DEFS.map((d) => d.name) as VisualName[];

// Components that render their own chrome
export const VISUALS_WITH_OWN_CHROME = VISUAL_DEFS
  .filter((d) => d.hasOwnChrome)
  .map((d) => d.name) as VisualName[];

// All intents used anywhere
export const VISUAL_INTENTS = Array.from(
  new Set(VISUAL_DEFS.flatMap((d) => d.intents ?? []))
) as VisualIntent[];

// Intent → component mapping
export const INTENT_TO_COMPONENT: Record<
  VisualIntent,
  VisualName | undefined
> = VISUAL_DEFS.reduce((acc, def) => {
  for (const intent of def.intents ?? []) {
    acc[intent] = def.name;
  }
  return acc;
}, {} as Record<VisualIntent, VisualName | undefined>);

