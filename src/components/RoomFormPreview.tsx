import type { RoomRules, RoomStyle, RoomTheme } from '../../shared/protocol'
import { STYLE_LABELS, djPlace, maxTrackChip } from '../rooms/roomLabels'
import RoomCardScene from './RoomCardScene'
import './RoomFormPreview.css'

interface RoomFormPreviewProps {
  name: string
  styles: RoomStyle[]
  theme: RoomTheme
  rules: RoomRules
  hostPseudo: string
  /** A room being made: it will be empty, with a free place for a DJ. A room that exists may not be: nothing said then. */
  fresh: boolean
}

/**
 * "Aperçu dans la liste des rooms" of mock-up 2b: the stage in the ambiance being picked, the name, the styles and the
 * longest track as chips, the host. Decoration of the form: everything it says is already in the fields.
 */
export default function RoomFormPreview({ name, styles, theme, rules, hostPseudo, fresh }: RoomFormPreviewProps) {
  const place = fresh ? djPlace(0, rules.maxDjs) : null
  return (
    <article className="room-preview">
      <div className="room-preview__scene">
        <RoomCardScene styles={styles} theme={theme} stageOnly />
        {fresh && (
          <span className="room-preview__pill">
            <i aria-hidden="true" />
            Vide pour l'instant
          </span>
        )}
      </div>
      <div className="room-preview__body">
        <p className="room-preview__name">{name.trim() === '' ? 'Le nom de ta room' : name}</p>
        <p className="room-preview__chips">
          {styles.map((style) => (
            <span key={style} className="room-preview__chip">
              {STYLE_LABELS[style]}
            </span>
          ))}
          <span className="room-preview__chip">{maxTrackChip(rules)}</span>
        </p>
        <p className="room-preview__host">
          Hôte : <strong>{hostPseudo}</strong>
          {place?.kind === 'free' && ' · Place DJ libre'}
        </p>
      </div>
    </article>
  )
}
