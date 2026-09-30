/*
 * Game analytics: a thin wrapper so the stores can note milestones without knowing about
 * PostHog. Until the plugin connects (production site only), track() quietly does nothing.
 */
type Capture = (event: string, props?: Record<string, unknown>) => void

let capture: Capture | null = null

export function connectAnalytics(fn: Capture) {
  capture = fn
}

export function track(event: string, props?: Record<string, unknown>) {
  try {
    capture?.(event, props)
  }
  catch {
    // Analytics must never get in the way of the game.
  }
}
