export async function fetchJsonOrThrow<T>(url: string, parseLabel: string): Promise<T> {
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text && text.trim().startsWith("<")
        ? `Server returned HTML error (status ${res.status})`
        : text || `HTTP ${res.status}`
    );
  }

  try {
    return (await res.json()) as T;
  } catch (e: any) {
    throw new Error(`Failed to parse ${parseLabel} response as JSON: ${e?.message || String(e)}`);
  }
}

/**
 * Returns JSON even if res.ok=false, *if* the body parses as JSON.
 * This matches your admin page behavior so you can render spec_errors/tools_errors/etc.
 */
export async function fetchJsonAllowErrors<T>(url: string, parseLabel: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text().catch(() => "");

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (json) return json as T;

  throw new Error(
    text && text.trim().startsWith("<")
      ? `Server returned HTML error (status ${res.status})`
      : text || `HTTP ${res.status}`
  );
}
