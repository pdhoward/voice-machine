// components/tenant-context.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type TenantCtx = {
  tenantId: string;
  setTenantId: (t: string) => void;

  agentId: string;
  setAgentId: (a: string) => void;

  token?: string | null;
  setToken: (t: string | null) => void;
};

const TenantContext = createContext<TenantCtx | null>(null);

export function TenantProvider({
  children,
  tenantId: tenantIdProp,
  agentId: agentIdProp,
  token: initialToken = null,
}: {
  children: React.ReactNode;
  tenantId?: string;
  agentId?: string;
  token?: string | null;
}) {
  const defaultTenantId = tenantIdProp ?? process.env.NEXT_PUBLIC_TENANT_ID ?? "machine";

  // Make tenant + agent mutable in-context
  const [tenantId, setTenantId] = useState<string>(defaultTenantId);
  const [agentId, setAgentId] = useState<string>(agentIdProp ?? "");
  const [token, setToken] = useState<string | null>(initialToken);

  // If parent changes props (rare but valid), sync local state
  useEffect(() => {
    const next = tenantIdProp ?? process.env.NEXT_PUBLIC_TENANT_ID ?? "machine";
    setTenantId((prev) => (prev === next ? prev : next));
  }, [tenantIdProp]);

  useEffect(() => {
    if (agentIdProp == null) return;
    setAgentId((prev) => (prev === agentIdProp ? prev : agentIdProp));
  }, [agentIdProp]);

  // If the server sets a cookie, we can fetch a lightweight endpoint to read + expose it on first load.
  useEffect(() => {
    (async () => {
      if (token) return; // already set
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.token) setToken(data.token);
        }
      } catch {}
    })();
  }, [token]);

  const value = useMemo(
    () => ({
      tenantId,
      setTenantId,
      agentId,
      setAgentId,
      token,
      setToken,
    }),
    [tenantId, agentId, token]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within <TenantProvider>");
  return ctx;
}
