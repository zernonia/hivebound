# Plan : Traduction française de Hivebound + sélecteur de langue

> Journal de bord de l'implémentation. Cocher au fur et à mesure.
> Décisions validées : **@nuxtjs/i18n** · **journal refactoré en IDs** (fallback texte brut pour les vieilles saves) · **réserve de prénoms traduite**.

## Architecture retenue

- Module `@nuxtjs/i18n` (v10, compatible Nuxt 4), `strategy: 'no_prefix'`, `detectBrowserLanguage: false`.
- Messages : `i18n/locales/en.json` + `i18n/locales/fr.json` (~500 clés chacun), groupés par domaine. Bundlés (pas de lazy) → assets `/_nuxt/` hashés → le service worker (`public/sw.js`, cache-first sur `/_nuxt/`) les met en cache automatiquement. **Aucune montée `VERSION` du SW nécessaire.**
- La langue choisie vit dans le settings store (`hivebound:settings:v1`, localStorage) → voyage avec le code de save exporté. Détection initiale : `navigator.language`.
- `<html lang>` réactif via le `useHead` existant (`app/pages/index.vue`).
- Accès à `t()` depuis les stores Pinia et utilitaires : instance `$i18n` du Nuxt app (helper dédié).
- Le préfixe de save `HIVEBOUND1:` et le format du code restent inchangés (non traduits).

### Conventions de clés (extrait)

| Domaine | Exemple |
|---|---|
| Species | `species.bumble.name`, `species.bumble.blurb` |
| POIs / terrain | `pois.signpost.journalTitle`, `terrain.softgrass` |
| Requêtes de la Reine | `requests.ch1.r01.title/ask/thanks`, `requests.wishes.*` |
| Journal | `journal.intro.title`, `journal.friends.bumble` (avec params) |
| Narration | `narration.atPlace`, `narration.flyingDir`… |
| Réglages | `settings.toggles.reducedMotion.label/hint`, `settings.textSizes.*` |
| Grammaire FR | clés par-ressource/par-espèce quand le genre l'exige (p. ex. `resources.nectar.flyHome` = « Rapporter du nectar ») |
| Pluriels | syntaxe pipe vue-i18n (`"hexagone | hexagones"`) |

## Checklists

### Phase 0 — Setup

- [x] Brancher une branche `claude/i18n-francais` (branche créée)
- [x] `npm install @nuxtjs/i18n` (v10.6.0)
- [x] `nuxt.config.ts` : module `@nuxtjs/i18n` + config `i18n` (locales en/fr, `no_prefix`, `detectBrowserLanguage: false`)
- [x] `i18n/locales/en.json` / `fr.json`
- [x] Vérifié : `npm run dev` démarre, `$i18n` typé (`Composer`), `setLocale` async (chunk lazy) → synchro via plugin async avant montage

### Phase 1 — Setting « Langue »

- [x] `app/stores/settings.ts` : état `lang: 'en' | 'fr'` (défaut `navigator.language`, SSR-safe)
- [x] `app/plugins/lang.client.ts` : `settings.load()` + `await setLocale()` avant le montage (pas de flash d'anglais) — les entrées de journal créées au boot passent par des clés (phase 3), donc pas de dépendance à la locale au chargement
- [x] `app/pages/index.vue` : watcher runtime + `htmlAttrs.lang` réactif
- [x] `app/components/ui/SettingsPanel.vue` : contrôle segmenté « Language » + pass i18n complet du panneau (toggles/contrôles/save/reset) — avancé depuis la phase 4
- [x] Vérifié : dev serveur démarre, typecheck OK

### Phase 2 — Fichiers de données vers des clés

- [x] `app/utils/species.ts` — `name`/`blurb` retirés des defs → `species.<id>.*` ; réserve des 28 prénoms traduite (nouvelles abeilles FR, anciennes gardent leur prénom persisté)
- [x] `app/utils/keepsakes.ts` — `name`/`blurb` → `keepsakes.<id>.*` (helpers `keepsakeName`/`keepsakeBlurb`)
- [x] `app/utils/world.ts` — `TERRAIN_LABEL` → `terrain.<id>.{label,at}` ; POIs → `pois.<id>.{name,the,at,journalTitle,journalBody}`
- [x] `app/utils/resources.ts` — helpers `resourceName/Lower/Some/The`, `buildingName/The/At/Of`, `upgradeDescribe(v)` paramétré, `formatAmounts()`
- [x] `app/utils/requests.ts` — 16 requêtes → `requests.<id>.*` ; wishes → pools per-locale TS (choix déterministe par hash inchangé) + `requests.wishes.thanks`
- [x] `app/utils/hex.ts` — `directionName(d)` + `compassWord` → `directions.*` / `compass.0..7`
- [x] `app/utils/daylight.ts` — traduction à l'affichage (`tod.*` dans GameHud)
- [x] `app/utils/saveTransfer.ts` — `save.errors.*` (préfixe `HIVEBOUND1:` non traduit)

### Phase 3 — Stores + refactor journal en IDs

- [x] `app/stores/game.ts` :
  - [x] `JournalEntry` : `titleKey`/`bodyKey`/`params` + `title`/`body` légués optionnels ; helpers `journalTitle`/`journalBody` (copie des params : vue-i18n y écrit le nombre pluriel)
  - [x] Entrées legacy : clés re-dérivées de l'id au rendu (`journalKeysFor`, 48 motifs couverts — `poi:`/`terrain:`/`bee:`/`queen:` + 8 ids fixes)
  - [x] Tous les `addJournal()` passent des clés (POIs, notes de terrain, intro, première nuit)
  - [x] Labels `primaryAction` (clés par-espèce), annonces bloquantes, toasts
  - [x] Moteur de narration → `narration.*` avec `{some}` partitif FR (`du nectar`, `de l'eau`, `de la cire`…)
- [x] `app/stores/queen.ts` — labels par-ressource/bâtiment, `talk()`/`handIn()` (`missing` intégré à `GoalLine`), jalons → clés
- [x] `app/stores/colony.ts` — danse (clés par-espèce pour le genre FR), apprivoisement, `statusText()`, rename/dismiss
- [x] `app/stores/hive.ts` — 3 entrées one-shot → clés, annonces
- [x] Vérifié : `npm run typecheck` passe

### Phase 4 — Composants UI (~15 fichiers)

- [x] `SettingsPanel.vue` (~45 chaînes) — fait en phase 1
- [x] `HivePanel.vue` (~30 : ruche, Reine, cellules, statuts)
- [x] `GameHud.vue` (~25 : jour/hexagones, boutons + aria-labels, astuce première partie)
- [x] `HiveSheet.vue` (~25 : colonie/améliorations + `localeCompare(lang)`)
- [x] `JournalPanel.vue` (~20 : onglets, slots, états découverte + rendu journal par clés avec fallback)
- [x] `WelcomeBack.vue` (pluriels → pipe vue-i18n)
- [x] `ThanksCard.vue` (citation finale + 6 libellés à pluriels)
- [x] `BuildMenu.vue`, `QueenTracker.vue`, `BefriendDance.vue`, `PouchMeter.vue`, `MovePad.vue`, `Minimap.vue`, `UiDialog.vue`, `GameScene.vue`, `pages/index.vue`
- [x] `PerfOverlay.vue` — laissé en anglais (outil dev)

### Phase 5 — Messages complets

- [x] `i18n/locales/en.json` — 705 clés, textes d'origine préservés à l'identique
- [x] `i18n/locales/fr.json` — 705 clés, narratrice au féminin, Reine en tutoiement (« petite », « chérie »), pluriels pipe, genre/articles via clés dédiées (`some`/`the`/`at` par entité)
- [x] Script de couverture : 0 clé manquante EN et FR ; test runtime vue-i18n (pluriels n=1/2/5 + interpolations) → tout rend correctement

### Phase 6 — Vérification

- [x] `npm run typecheck` — OK
- [x] `npm run generate` (build production statique) — OK
- [x] Serveur dev boot ; gotcha identifié et neutralisé : vue-i18n **mute l'objet params** (injecte `n`/`count`) → tous les appels passent des littéraux frais, `journalTitle` copie `e.params` (état persisté)
- [x] Balayage anti-anglais résiduel sur `app/` : seul `PerfOverlay` (dev) reste en anglais
- [ ] Test navigateur manuel complet (commutation EN↔FR, reload, vieille save anglaise importée) — à faire par l'auteur sur le preview

### Phase 7 — Livraison

- [ ] Commit(s) propre(s) sur la branche
- [ ] PR ouverte + **lien preview Cloudflare** (`https://<branch>-hivebound.zernonia.workers.dev`) conformément au CLAUDE.md, build Workers Builds vérifié

## Notes de risque

1. **Journal persisté** : les entrées créées avant le refactor n'ont pas de clé, mais leurs ids sont stables → les clés sont re-dérivées de l'id **au rendu** (`journalKeysFor`), donc même les vieilles saves s'affichent dans la langue jouée ; le texte brut ne reste qu'en dernier recours pour un id inconnu.
2. **Toasts/annonces** sont des snapshots texte au moment de l'émission → une commutation de langue en cours d'affichage garde la langue d'origine (éphémère, acceptable).
3. **vue-i18n** : caractères `|` et `@` spéciaux dans les messages — à échapper si présents dans le texte.
4. **Tri** `HiveSheet` : passer la locale à `localeCompare` pour les accents français.
5. **Manifest/meta `og:`** : laissés en anglais (page client-only, choix validé).
