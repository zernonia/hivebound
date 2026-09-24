import { gameAudio } from '~/audio/engine'
import { useGame } from '~/stores/game'
import { useHive } from '~/stores/hive'
import { useSettings } from '~/stores/settings'
import { PRODUCTS } from '~/utils/resources'

/**
 * Connects game state to sound: unlocks audio on the first key press / tap, follows the
 * volume settings and the scene (meadow / hive music), and plays one-shots when things
 * happen. The wing buzz is driven per frame from GameScene.
 */
export function useGameAudio() {
  const game = useGame()
  const hive = useHive()
  const settings = useSettings()

  const unlock = () => {
    gameAudio.unlock()
    gameAudio.setVolumes(settings.musicVolume, settings.sfxVolume)
    gameAudio.setMood(game.scene === 'hive' ? 'hive' : 'meadow')
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
  watch(() => game.scene, s => gameAudio.setMood(s === 'hive' ? 'hive' : 'meadow'))

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

  // Finished goods only arrive in the store by collecting them.
  watch(() => PRODUCTS.reduce((sum, p) => sum + hive.stock[p], 0), (n, old) => n > old && gameAudio.collect())

  const buildings = () => Object.values(hive.cells).filter(c => c.building).length
  const upgrades = () => Object.values(hive.upgrades).reduce((a, b) => a + b, 0)
  watch(() => buildings() + hive.unlocked.length + upgrades(), (n, old) => n > old && gameAudio.fanfare())

  watch(() => hive.selected, () => game.scene === 'hive' && !game.transition && gameAudio.tick())
}
