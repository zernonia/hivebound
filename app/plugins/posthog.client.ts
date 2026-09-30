/*
 * PostHog, kept small and gentle: pageviews plus a handful of named game milestones
 * (see utils/analytics.ts). No autocaptured clicks, no session recordings, no surveys,
 * no cookies (an anonymous id lives in localStorage), no person profiles, and Do Not Track
 * is respected. Only the live site reports, so local dev, previews and forks send nothing.
 */
import { connectAnalytics, track } from '~/utils/analytics'

const LIVE_HOST = 'hivebound.zernonia.workers.dev'
// Project API key for the "Hivebound" PostHog project: public by design (it can only send events).
const KEY = 'phc_pVzBg9uMAkVEcNBnXCQAHLpyTQnhBMUtrkHBXXZJLQmX'

export default defineNuxtPlugin(() => {
  if (import.meta.dev || location.hostname !== LIVE_HOST) return
  // Checked now, before the game makes its first save, so new players aren't counted as returning.
  const returning = !!localStorage.getItem('hivebound:save:v1')
  // Loaded after the game starts so it never slows the first frame.
  const start = async () => {
    const { default: posthog } = await import('posthog-js')
    posthog.init(KEY, {
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-08-30',
      persistence: 'localStorage',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      respect_dnt: true,
    })
    connectAnalytics((event, props) => posthog.capture(event, props))
    track('game_opened', { returning })
  }
  if (document.readyState === 'complete') setTimeout(start, 0)
  else window.addEventListener('load', () => setTimeout(start, 0), { once: true })
})
