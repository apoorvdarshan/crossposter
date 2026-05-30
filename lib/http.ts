type RequestBody = Record<string, unknown> | URLSearchParams;

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as T;
  }
}

export async function assertOk<T>(response: Response): Promise<T> {
  const body = await readJson<T & { error?: string; message?: string }>(response);

  if (!response.ok) {
    const detail =
      typeof body === "object" && body
        ? [body.error, body.message].filter(Boolean).join(": ") || JSON.stringify(body)
        : response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }

  return body;
}

export function jsonRequest(body: RequestBody): string | URLSearchParams {
  return body instanceof URLSearchParams ? body : JSON.stringify(body);
}

export function compactText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join("\n\n").trim();
}
