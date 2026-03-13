export function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return value;
}

export function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  return slug || fallback;
}

export function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

export function makeContainsPattern(value) {
  return `%${escapeLike(String(value || "").trim())}%`;
}

export function randomHex(bytes = 4) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
