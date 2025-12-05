// components/visuals/registry.tsx
"use client";

import React from "react";
import {
  VISUAL_COMPONENTS,
  type VisualName,
} from "@/types/manifest";

// A Visual is a default-exported React component
type VisualAny = React.ComponentType<any>;

// Loader returns a module with default export
export type VisualLoader = () => Promise<{ default: VisualAny }>;

let loaders: Record<VisualName, VisualLoader> = {
  media_gallery: () => import("./MediaGallery"),
  image_viewer: () => import("./ImageViewer"),
  video: () => import("./VideoPlayer"),
  room: () => import("./RoomList"),
  quote_summary: () => import("./QuoteSummary"),
  catalog_results: () => import("./CatalogResults"),
  reservation_checkout: () => import("./ReservationCheckout"),
};

// Allow dynamic plugins/extensions at runtime (client-side)
export function registerVisualComponent(name: VisualName, loader: VisualLoader) {
  loaders[name] = loader;
}

// Get a **lazy** component (or null if not found)
export function getVisualComponent(name: VisualName): React.LazyExoticComponent<VisualAny> | null {
  const loader = loaders[name];
  if (!loader) return null;
  return React.lazy(loader);
}

if (process.env.NODE_ENV === "development") {
  const missing = VISUAL_COMPONENTS.filter((name) => !(name in loaders));
  if (missing.length) {
    console.warn("[visuals/registry] Missing loaders for:", missing);
  }
}


const cache = new Map<string, Promise<any>>();
export function preloadVisual(name: VisualName) {
  const loader = loaders[name];
  if (!loader) return;
  if (!cache.has(name)) cache.set(name, loader());
  return cache.get(name)!;
}

// safe list (optional)
export function listRegisteredVisuals() {
  return Object.keys(loaders).sort();
}
