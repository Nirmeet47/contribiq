import crypto from "node:crypto";

const ENCRYPTED_TOKEN_PREFIX = "enc:v1:";

function getEncryptionSecret() {
  return process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY ?? null;
}

function isEncryptedGithubToken(token: string) {
  return token.startsWith(ENCRYPTED_TOKEN_PREFIX);
}

function decryptAesGcm(value: string, secret: string) {
  const parts = value.startsWith(ENCRYPTED_TOKEN_PREFIX)
    ? value.slice(ENCRYPTED_TOKEN_PREFIX.length).split(":")
    : value.split(":");

  if (parts.length !== 3) {
    throw new Error("Unsupported encrypted token format");
  }

  const [ivValue, tagValue, encryptedValue] = parts;
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = Buffer.from(ivValue, "base64");
  const authTag = Buffer.from(tagValue, "base64");
  const encrypted = Buffer.from(encryptedValue, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function encryptGithubToken(rawToken: string | null | undefined) {
  if (!rawToken) return null;

  const token = rawToken.trim();
  if (!token) return null;
  if (isEncryptedGithubToken(token)) return token;

  const encryptionSecret = getEncryptionSecret();
  if (!encryptionSecret) {
    throw new Error("GitHub token encryption key is not configured");
  }

  const key = crypto.createHash("sha256").update(encryptionSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_TOKEN_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptGithubToken(storedToken: string | null | undefined) {
  if (!storedToken) return null;

  const token = storedToken.trim();
  if (!token) return null;

  const encryptionSecret = getEncryptionSecret();

  if (encryptionSecret && (isEncryptedGithubToken(token) || token.split(":").length === 3)) {
    return decryptAesGcm(token, encryptionSecret);
  }

  if (isEncryptedGithubToken(token)) {
    throw new Error("GitHub token is encrypted but no encryption key is configured");
  }

  return token;
}

export function getAppGitHubToken() {
  return process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? null;
}
