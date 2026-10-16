// Reading JSON that the tutor stored in localStorage: a boundary, so every field is checked where it is read.

/** The stored JSON object, or undefined when nothing is stored or it is not a JSON object. */
export function storedObject(raw: string | null): object | undefined {
  if (raw === null) return undefined;
  try {
    const json: unknown = JSON.parse(raw);
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

/** An own field of a stored object; unknown until the caller checks it. */
export function field(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null && Object.hasOwn(obj, key) ? Reflect.get(obj, key) : undefined;
}
