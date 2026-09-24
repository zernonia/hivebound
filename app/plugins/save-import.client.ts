import { applyPendingImport } from '~/utils/saveTransfer'

// Plugins run before the game page mounts, so a save loaded in Settings lands in
// localStorage before any store reads it (and after the old game's pagehide save).
export default defineNuxtPlugin(() => {
  applyPendingImport()
})
