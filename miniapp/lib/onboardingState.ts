/**
 * Client-side onboarding state utilities
 * Single source of truth for checking onboarding status
 */

export interface OnboardingState {
  hasUser: boolean;
  hasConsent: boolean;
  profileComplete: boolean;
  userId: number | null;
  telegram_id: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Get onboarding state from API
 */
export async function getOnboardingState(userId: number | null): Promise<OnboardingState> {
  if (!userId) {
    return {
      hasUser: false,
      hasConsent: false,
      profileComplete: false,
      userId: null,
      telegram_id: null,
      loading: false,
      error: "userId is required",
    };
  }

  try {
    const response = await fetch(`/api/onboarding/status?userId=${userId}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        hasUser: false,
        hasConsent: false,
        profileComplete: false,
        userId,
        telegram_id: null,
        loading: false,
        error: data.error || "Failed to fetch onboarding state",
      };
    }

    return {
      hasUser: data.hasUser,
      hasConsent: data.hasConsent,
      profileComplete: data.profileComplete,
      userId: data.userId,
      telegram_id: data.telegram_id,
      loading: false,
      error: null,
    };
  } catch (error: any) {
    return {
      hasUser: false,
      hasConsent: false,
      profileComplete: false,
      userId,
      telegram_id: null,
      loading: false,
      error: error?.message || "Network error",
    };
  }
}

/**
 * Determine redirect path based on onboarding state
 * Returns null if no redirect needed, or path to redirect to
 */
export function getRedirectPath(state: OnboardingState): string | null {
  // If no user, can't determine - stay on current page
  if (!state.hasUser) {
    return null;
  }

  // If consent missing -> redirect to consent page
  if (!state.hasConsent) {
    return `/privacy/consent?id=${state.userId}`;
  }

  // If profile incomplete -> redirect to registration
  if (!state.profileComplete) {
    return `/registration?id=${state.userId}`;
  }

  // All good - no redirect needed
  return null;
}
