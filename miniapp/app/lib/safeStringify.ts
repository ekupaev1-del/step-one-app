/**
 * Safe JSON stringify that handles circular references and special types
 * Used in client-side debug UI to prevent crashes
 */

export function safeStringify(value: any, space?: number): string {
  try {
    const seen = new WeakSet();
    
    const replacer = (key: string, val: any): any => {
      // Handle circular references
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
      }

      // Handle BigInt
      if (typeof val === "bigint") {
        return val.toString();
      }

      // Handle Error objects
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
          stack: val.stack,
        };
      }

      // Handle Map
      if (val instanceof Map) {
        return Object.fromEntries(val);
      }

      // Handle Set
      if (val instanceof Set) {
        return Array.from(val);
      }

      // Handle undefined (JSON.stringify converts to null, but we want to show it)
      if (val === undefined) {
        return "[undefined]";
      }

      return val;
    };

    return JSON.stringify(value, replacer, space);
  } catch (error) {
    // If even safe stringify fails, return a safe error message
    try {
      return JSON.stringify({
        error: "Failed to stringify",
        message: error instanceof Error ? error.message : String(error),
      }, null, space);
    } catch {
      return '{"error": "Failed to stringify value"}';
    }
  }
}
