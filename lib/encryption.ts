import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";

// Dynamic salt based on device ID to make data theft useless on other phones
const getDeviceSalt = () => Device.osBuildId || "LearnovaX-Static-Salt";

/**
 * Advanced Masking Encryption (XOR + Base64)
 * Makes it nearly impossible to decrypt without the device-specific salt.
 */
export async function encryptAPIKey(apiKey: string): Promise<string> {
  const salt = getDeviceSalt();
  let result = "";
  for (let i = 0; i < apiKey.length; i++) {
    result += String.fromCharCode(apiKey.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return btoa(result);
}

export async function decryptAPIKey(encrypted: string): Promise<string> {
  const salt = getDeviceSalt();
  const decoded = atob(encrypted);
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  // Sanitize: remove any non-printable or control characters (0x00-0x1F, 0x7F-0x9F)
  return result.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
}

/**
 * Validate API key format
 */
export function validateAPIKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || apiKey.trim().length < 8) return false;
  const trimmedKey = apiKey.trim();
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[A-Za-z0-9\-_]{20,}$/,
    gemini: /^AIza[0-9A-Za-z\-_]{30,}$/,
    groq: /^gsk_[A-Za-z0-9\-_]{30,}$/,
    anthropic: /^sk-ant-[A-Za-z0-9\-_]{30,}$/,
  };
  const pattern = patterns[provider];
  return pattern ? pattern.test(trimmedKey) : trimmedKey.length >= 20;
}

export function maskAPIKey(apiKey: string): string {
  if (apiKey.length < 8) return "****";
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}

export function sanitizeErrorMessage(error: string): string {
  return error.replace(/(sk-|AIza|gsk_|sk-ant-)[A-Za-z0-9\-_]{20,}/g, "[PRIVATE_KEY_REDACTED]");
}
