import crypto from "node:crypto";

function decryptAesGcm(value: string, secret: string) {
  const parts = value.startsWith("enc:v1:")
    ? value.slice("enc:v1:".length).split(":")
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

export function decryptGithubToken(storedToken: string | null | undefined) {
  if (!storedToken) return null;

  const token = storedToken.trim();
  if (!token) return null;

  const encryptionSecret =
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY;

  if (encryptionSecret && (token.startsWith("enc:v1:") || token.split(":").length === 3)) {
    return decryptAesGcm(token, encryptionSecret);
  }

  return token;
}

export function getAppGitHubToken() {
  return process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? null;
}
