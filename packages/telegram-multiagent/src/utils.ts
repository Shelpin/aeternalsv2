/**
 * Utility functions for the telegram-multiagent package
 */

/**
 * Generate a simple UUID v4 (random) string
 * This is a simplified implementation and not cryptographically secure
 * It's intended as a drop-in replacement for the uuid package in this specific context
 * 
 * @returns UUID v4 string
 */
export function generateUUID(): string {
  const pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return pattern.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Sleep for a specified duration
 * 
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a timestamp as an ISO string
 * 
 * @param timestamp - Timestamp to format (defaults to current time)
 * @returns Formatted timestamp string
 */
export function formatTimestamp(timestamp: number = Date.now()): string {
  return new Date(timestamp).toISOString();
}

/**
 * Safely parse JSON with error handling
 * 
 * @param json - JSON string to parse
 * @param fallback - Default value to return if parsing fails
 * @returns Parsed object or fallback value
 */
export function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    return fallback;
  }
} 