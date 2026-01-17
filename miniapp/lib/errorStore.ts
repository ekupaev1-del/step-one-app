/**
 * In-memory error store for debugging
 * Stores last ~100 errors keyed by requestId/code
 */

interface ErrorEntry {
  code: string;
  route: string;
  requestId: string;
  telegram: {
    chatId?: number;
    userId?: number;
  };
  db: {
    message?: string;
    code?: string;
    detail?: string;
    hint?: string;
    constraint?: string;
    table?: string;
    column?: string;
  };
  payloadKeys: string[];
  payloadPreview: Record<string, any>;
  timestamp: string;
  operation?: string;
}

class ErrorStore {
  private errors: Map<string, ErrorEntry> = new Map();
  private readonly MAX_SIZE = 100;

  /**
   * Store an error entry
   */
  store(error: ErrorEntry): void {
    // Remove oldest if at capacity
    if (this.errors.size >= this.MAX_SIZE) {
      const firstKey = this.errors.keys().next().value;
      if (firstKey) {
        this.errors.delete(firstKey);
      }
    }
    
    // Store by both code and requestId for easy lookup
    this.errors.set(error.code, error);
    if (error.code !== error.requestId) {
      this.errors.set(error.requestId, error);
    }
  }

  /**
   * Get error by code or requestId
   */
  get(code: string): ErrorEntry | undefined {
    return this.errors.get(code);
  }

  /**
   * Get all errors (for debugging)
   */
  getAll(): ErrorEntry[] {
    return Array.from(this.errors.values());
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors.clear();
  }
}

// Singleton instance
export const errorStore = new ErrorStore();
