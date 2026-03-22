/**
 * Comprehensive error handling and logging system
 */

export interface AppError {
  code: string;
  message: string;
  originalError?: Error;
  timestamp: string;
  context?: Record<string, unknown>;
  severity: "info" | "warning" | "error" | "critical";
}

/**
 * Error codes
 */
export const ERROR_CODES = {
  NETWORK_ERROR: "NETWORK_ERROR",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  CONNECTION_REFUSED: "CONNECTION_REFUSED",
  INVALID_API_KEY: "INVALID_API_KEY",
  API_QUOTA_EXCEEDED: "API_QUOTA_EXCEEDED",
  API_RATE_LIMIT: "API_RATE_LIMIT",
  UNSUPPORTED_MODEL: "UNSUPPORTED_MODEL",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  STORAGE_ERROR: "STORAGE_ERROR",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",
  DECRYPTION_ERROR: "DECRYPTION_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

/**
 * Parse error messages to extract error codes and user-friendly English messages
 */
export function parseErrorResponse(error: unknown): AppError {
  const timestamp = new Date().toISOString();

  if (typeof error === "string") {
    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error,
      timestamp,
      severity: "error",
    };
  }

  if (error instanceof Error) {
    const message = error.message;

    // 1. Network / Internet Connection Errors
    if (
      message.toLowerCase().includes("network") || 
      message.toLowerCase().includes("fetch") || 
      message.toLowerCase().includes("econnrefused") ||
      message.toLowerCase().includes("failed to fetch") ||
      message.toLowerCase().includes("internet")
    ) {
      return {
        code: ERROR_CODES.NETWORK_ERROR,
        message: "Network connection failed. Please turn on your data or check your internet connection.",
        originalError: error,
        timestamp,
        severity: "warning",
      };
    }

    // 2. Invalid API Key Errors
    if (
      message.includes("401") || 
      message.toLowerCase().includes("unauthorized") || 
      message.toLowerCase().includes("invalid api key") ||
      message.toLowerCase().includes("api key not valid")
    ) {
      return {
        code: ERROR_CODES.INVALID_API_KEY,
        message: "Invalid API key. Please check and update it in the settings.",
        originalError: error,
        timestamp,
        severity: "error",
      };
    }

    // 3. Quota / Token / Billing Errors
    if (
      message.includes("429") || 
      message.toLowerCase().includes("quota") || 
      message.toLowerCase().includes("credit") || 
      message.toLowerCase().includes("balance") ||
      message.toLowerCase().includes("insufficient_quota")
    ) {
      return {
        code: ERROR_CODES.API_QUOTA_EXCEEDED,
        message: "Your API token/quota has been exhausted. Please provide a new API key or try again tomorrow.",
        originalError: error,
        timestamp,
        severity: "error",
      };
    }

    // 4. Rate Limit (Too many requests)
    if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("too many requests")) {
      return {
        code: ERROR_CODES.API_RATE_LIMIT,
        message: "The AI is currently busy. Please wait a moment and try again.",
        originalError: error,
        timestamp,
        severity: "warning",
      };
    }

    // 5. Model Not Found
    if (message.includes("404") || message.toLowerCase().includes("model_not_found")) {
      return {
        code: ERROR_CODES.UNSUPPORTED_MODEL,
        message: "The selected model is not available for your API key. Please try a different model.",
        originalError: error,
        timestamp,
        severity: "error",
      };
    }

    // Default Error
    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: "An unexpected error occurred. Please try again later.",
      originalError: error,
      timestamp,
      severity: "error",
    };
  }

  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: "An unexpected error occurred. Please try again.",
    timestamp,
    severity: "error",
  };
}

/**
 * Log error and return formatted app error
 */
export function logError(error: unknown, context?: Record<string, unknown>): AppError {
  const appError = parseErrorResponse(error);
  appError.context = context;
  if (__DEV__) console.error(`[${appError.code}]`, appError.message, context);
  return appError;
}

/**
 * Utility to get error message directly
 */
export function getFriendlyErrorMessage(error: unknown): string {
  const parsed = parseErrorResponse(error);
  return parsed.message;
}

/**
 * Enhanced retry mechanism with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    const parsed = parseErrorResponse(error);
    // Don't retry for authentication/quota errors
    if (
      parsed.code === ERROR_CODES.INVALID_API_KEY || 
      parsed.code === ERROR_CODES.API_QUOTA_EXCEEDED ||
      parsed.code === ERROR_CODES.UNSUPPORTED_MODEL
    ) {
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * factor, factor);
  }
}

/**
 * Wrapper for API calls to catch and format errors
 */
export function handleAPIError(error: unknown): never {
  const appError = logError(error);
  throw new Error(appError.message);
}

// Development flag
declare const __DEV__: boolean;
