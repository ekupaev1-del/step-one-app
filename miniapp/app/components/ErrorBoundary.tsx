"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      console.error("[ErrorBoundary] Caught error:", error);
      console.error("[ErrorBoundary] Error info:", errorInfo);

      // Try to detect React #310
      const isReact310 = error.message?.includes("310") || 
                        error.message?.includes("Rendered more hooks") ||
                        error.message?.includes("hooks order");

      // Store error info for DebugOverlay if available
      if (typeof window !== "undefined") {
        try {
          const errorData = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            route: window.location.pathname + window.location.search,
            timestamp: new Date().toISOString(),
            suspectedCause: isReact310 ? "hooks-order-changed" : "unknown",
          };
          window.dispatchEvent(new CustomEvent("errorboundary-caught", { detail: errorData }));
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // Even logging can fail, ignore
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  copyError = () => {
    try {
      const errorText = this.getErrorText();
      this.copyToClipboard(errorText);
    } catch (e) {
      console.error("[ErrorBoundary] Failed to copy error:", e);
    }
  };

  getErrorText = (): string => {
    try {
      const { error, errorInfo } = this.state;
      let text = "Error Details:\n\n";

      if (error) {
        text += `Error: ${error.name}\n`;
        text += `Message: ${error.message}\n`;
        if (error.stack) {
          text += `Stack: ${error.stack}\n`;
        }
      }

      if (errorInfo) {
        text += `\nComponent Stack:\n${errorInfo.componentStack}`;
      }

      // Add environment info if available
      try {
        if (typeof window !== "undefined") {
          text += `\n\nURL: ${window.location.href}\n`;
          text += `User Agent: ${navigator.userAgent}\n`;
        }
      } catch (e) {
        // Ignore
      }

      return text;
    } catch (e) {
      return "Failed to generate error text";
    }
  };

  copyToClipboard = (text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          alert("Error copied to clipboard");
        }).catch(() => {
          this.fallbackCopy(text);
        });
      } else {
        this.fallbackCopy(text);
      }
    } catch (e) {
      this.fallbackCopy(text);
    }
  };

  fallbackCopy = (text: string) => {
    try {
      if (typeof document === "undefined") return;

      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      textArea.style.opacity = "0";

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand("copy");
        if (successful) {
          alert("Error copied to clipboard");
        } else {
          alert("Failed to copy. Please select and copy manually.");
        }
      } catch (err) {
        alert("Failed to copy. Please select and copy manually.");
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (e) {
      alert("Failed to copy error");
    }
  };

  reload = () => {
    try {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e) {
      console.error("[ErrorBoundary] Failed to reload:", e);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Something went wrong
            </h1>

            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <button
                onClick={this.copyError}
                className="w-full px-4 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
              >
                Copy error
              </button>
              <button
                onClick={this.reload}
                className="w-full px-4 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                Reload
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
              {typeof window !== "undefined" && window.location.href ? (
                <div>URL: {window.location.href.substring(0, 50)}...</div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
