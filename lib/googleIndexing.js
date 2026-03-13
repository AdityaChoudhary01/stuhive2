const SCOPES = ["https://www.googleapis.com/auth/indexing"];
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function signJwt(payload, privateKeyPem) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Missing Google credentials");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: process.env.GOOGLE_CLIENT_EMAIL,
      scope: SCOPES.join(" "),
      aud: TOKEN_ENDPOINT,
      exp: issuedAt + 3600,
      iat: issuedAt,
    },
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.access_token;
}

async function notifyGoogle(url, type) {
  const accessToken = await getAccessToken();

  const response = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return true;
}

function getTargetUrl(baseUrl, identifier, type) {
  if (type === "note") return `${baseUrl}/notes/${identifier}`;
  if (type === "blog") return `${baseUrl}/blogs/${identifier}`;
  if (type === "profile") return `${baseUrl}/profile/${identifier}`;
  if (type === "collection") return `${baseUrl}/shared-collections/${identifier}`;
  if (type === "opportunity" || type === "update") return `${baseUrl}/updates/${identifier}`;
  if (type === "roadmap") return `${baseUrl}/roadmaps/${identifier}`;

  throw new Error(`Invalid SEO indexing type provided: ${type}`);
}

export async function indexNewContent(identifier, type) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://www.stuhive.in";
    const targetUrl = getTargetUrl(baseUrl, identifier, type);

    await notifyGoogle(targetUrl, "URL_UPDATED");
    console.log("SEO Success:", targetUrl);
    return true;
  } catch (error) {
    console.error("SEO Error:", error.message);
    return false;
  }
}

export async function removeContentFromIndex(identifier, type) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://www.stuhive.in";
    const targetUrl = getTargetUrl(baseUrl, identifier, type);

    await notifyGoogle(targetUrl, "URL_DELETED");
    console.log("SEO Delete Success:", targetUrl);
    return true;
  } catch (error) {
    console.error("SEO Delete Error:", error.message);
    return false;
  }
}
