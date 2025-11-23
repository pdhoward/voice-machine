// /config/rate.ts
// Single source of truth for platform limits. 
// Values come from env with safe defaults.
// split between the console (live demo) vs commercial (widget use)
function num(v: string | undefined, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

type SessionLimits = {
  sessionPerMin: number;
  maxDailyTokens: number;
  maxDailyDollars: number;
  maxConcurrent: number;
};

const consoleLimits: SessionLimits = {
  sessionPerMin: num(process.env.CONSOLE_SESSION_PER_MIN, 3),
  maxDailyTokens: num(process.env.CONSOLE_MAX_TOKENS_DAILY, 50_000),
  maxDailyDollars: num(process.env.CONSOLE_MAX_DOLLARS_DAILY, 1),
  maxConcurrent: num(process.env.CONSOLE_MAX_CONCURRENT_SESSIONS, 1),
};

const widgetLimits: SessionLimits = {
  sessionPerMin: num(process.env.WIDGET_SESSION_PER_MIN, 12),
  maxDailyTokens: num(process.env.WIDGET_MAX_TOKENS_DAILY, 300_000),
  maxDailyDollars: num(process.env.WIDGET_MAX_DOLLARS_DAILY, 20),
  maxConcurrent: num(process.env.WIDGET_MAX_CONCURRENT_SESSIONS, 10),
};

export const rateCfg = {
  // Edge per-minute controls (shared)
  ipPerMin: num(process.env.RATE_IP_PER_MIN, 60),
  userPerMin: num(process.env.RATE_USER_PER_MIN, 120),
  burst: num(process.env.RATE_BURST, 20),

  // Global session bounds
  maxSessionMinutes: num(process.env.MAX_SESSION_MINUTES, 15),
  maxSessionIdleSec: num(process.env.MAX_SESSION_IDLE_SEC, 300),

  windowSec: 60,

  requireAuthForSession:
    String(process.env.REQUIRE_AUTH_FOR_SESSION || "true") === "true",

  enableServerMinuteChecks:
    String(process.env.ENABLE_SERVER_MINUTE_CHECKS || "false") === "true",

  consoleLimits,
  widgetLimits,

  getLimits(kind: "console" | "widget" | null | undefined): SessionLimits {
    return kind === "console" ? consoleLimits : widgetLimits;
  },
} as const;
