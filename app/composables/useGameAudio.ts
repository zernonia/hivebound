import { gameAudio } from '~/audio/engine'
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { useSettings } from '~/stores/settings'
import { isNight } from '~/utils/daylight'

/**
 * Connects game state to sound: unlocks audio on the first key press / tap, follows the
 * volume settings and the scene (meadow / night / hive music), and plays one-shots when things
 * happen. The wing buzz is driven per frame from GameScene.
 */
export function useGameAudio() {
  const game = useGame()
  const hive = useHive()
  const settings = useSettings()
  /** Hive inside; outside, night music after dark (when day and night are on). */
  const mood = () => (game.scene === 'hive' ? 'hive' : settings.dayNight && isNight() ? 'night' : 'meadow')

  const unlock = () => {
    gameAudio.unlock()
    gameAudio.setVolumes(settings.musicVolume, settings.sfxVolume)
    gameAudio.setMood(mood())
  }
  const onVisibility = () => gameAudio.setSuspended(document.visibilityState === 'hidden')

  onMounted(() => {
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    document.removeEventListener('visibilitychange', onVisibility)
    gameAudio.dispose()
  })

  watch(() => [settings.musicVolume, settings.sfxVolume] as const, ([m, s]) => gameAudio.setVolumes(m, s))
  watch(() => [game.scene, settings.dayNight], () => gameAudio.setMood(mood()))
  // Dusk and dawn come on the real clock: check now and then whether the mood should turn.
  const moodClock = setInterval(() => gameAudio.setMood(mood()), 15_000)
  onBeforeUnmount(() => clearInterval(moodClock))

  // Gathering fills the pouch; reaching the doorstep (or going inside) empties it.
  watch(() => hive.pouchTotal, (n, old) => {
    if (n > old) {
      gameAudio.gather(n / hive.pouchCapacity)
      if (hive.pouchFull) gameAudio.pouchFull()
    }
    else if (n < old) {
      gameAudio.unload()
    }
  })

  watch(() => game.journal.length, (n, old) => n > old && gameAudio.discover())
  watch(() => game.transition, t => t && gameAudio.hiveDoor(t === 'enter'))

  // Chime when you empty a tray yourself (helpers quietly carry theirs in, so no sound then).
  const trays = () => Object.values(hive.cells).reduce((sum, c) => sum + c.output, 0)
  watch(trays, (n, old) => n < old && gameAudio.collect())
  // Golden pollen: a bright little sparkle.
  watch(() => hive.stock.golden, (n, old) => n > old && gameAudio.befriended())

  const buildings = () => Object.values(hive.cells).filter(c => c.building).length
  const upgrades = () => Object.values(hive.upgrades).reduce((a, b) => a + b, 0)
  watch(() => buildings() + hive.unlocked.length + upgrades(), (n, old) => n > old && gameAudio.fanfare())

  watch(() => hive.selected, () => game.scene === 'hive' && !game.transition && gameAudio.tick())
}
