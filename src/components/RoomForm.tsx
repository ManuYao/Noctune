import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ROOM_DESCRIPTION_MAX,
  ROOM_MAX_DJS_CHOICES,
  ROOM_MAX_TRACK_CHOICES,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
  ROOM_REPEAT_CHOICES,
  ROOM_STYLES,
  ROOM_STYLES_MAX,
  ROOM_THEMES,
  type RoomSettings,
  type RoomStyle,
} from '../../shared/protocol'
import type { RoomCallFailure } from '../rooms/roomApi'
import { STYLE_LABELS, THEME_LABELS, maxTrackLabel, repeatLabel, themeAttribute } from '../rooms/roomLabels'
import { roomErrorField, roomErrorMessage, type RoomField } from '../rooms/roomMessages'
import RoomCard from './RoomCard'
import './RoomForm.css'

interface RoomFormProps {
  initial: RoomSettings
  /** Pseudo of the host, for the preview card. */
  hostPseudo: string
  /** What the box under the preview says first: "Tu seras l'hôte" when making, "Tu es l'hôte" when changing. */
  hostTitle: string
  submitLabel: string
  /** The server's answer: it worked, or why not. The form shows the reason next to the part it is about. */
  onSubmit: (settings: RoomSettings) => Promise<{ ok: true } | RoomCallFailure>
  onCancel: () => void
  cancelLabel?: string
  /** Under the buttons of the form: the edit page puts the deletion there. */
  children?: ReactNode
}

type Errors = Partial<Record<RoomField | 'form', string>>

const codePoints = (text: string) => [...text].length

/** One line, spaces folded: a description is a sentence, not a page. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

interface ChoiceProps<T extends number | null> {
  legend: string
  hint: string
  name: string
  choices: readonly T[]
  value: T
  label: (choice: T) => string
  onChange: (choice: T) => void
  error?: string
}

/** A row of chips of which exactly one is chosen: real radio buttons, so the arrow keys and screen readers work. */
function Choice<T extends number | null>({ legend, hint, name, choices, value, label, onChange, error }: ChoiceProps<T>) {
  return (
    <fieldset className="room-form__rule" aria-describedby={error ? `${name}-error` : undefined}>
      <legend>
        <span>{legend}</span>
        <small>{hint}</small>
      </legend>
      <div className="room-form__chips">
        {choices.map((choice) => (
          <label key={String(choice)} className="room-form__chip">
            <input type="radio" name={name} checked={value === choice} onChange={() => onChange(choice)} />
            <span>{label(choice)}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className="room-form__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export default function RoomForm({ initial, hostPseudo, hostTitle, submitLabel, onSubmit, onCancel, cancelLabel = 'Annuler', children }: RoomFormProps) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [styles, setStyles] = useState<RoomStyle[]>(initial.styles)
  const [theme, setTheme] = useState(initial.theme)
  const [maxTrackSec, setMaxTrackSec] = useState(initial.rules.maxTrackSec)
  const [repeatDelaySec, setRepeatDelaySec] = useState(initial.rules.repeatDelaySec)
  const [maxDjs, setMaxDjs] = useState(initial.rules.maxDjs)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const descriptionField = useRef<HTMLTextAreaElement>(null)

  const rules = { maxTrackSec, repeatDelaySec, maxDjs }

  function toggleStyle(style: RoomStyle) {
    setErrors((previous) => ({ ...previous, styles: undefined }))
    setStyles((previous) => {
      if (previous.includes(style)) return previous.filter((candidate) => candidate !== style)
      if (previous.length >= ROOM_STYLES_MAX) return previous
      return ROOM_STYLES.filter((candidate) => candidate === style || previous.includes(candidate))
    })
  }

  function focusField(field: RoomField | null) {
    if (field === 'name') nameField.current?.focus()
    else if (field === 'description') descriptionField.current?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    // The server is the judge of everything; these two only spare a round trip for the obvious.
    const trimmed = name.trim()
    if (codePoints(trimmed) < ROOM_NAME_MIN || codePoints(trimmed) > ROOM_NAME_MAX) {
      setErrors({ name: `Le nom de la room fait de ${ROOM_NAME_MIN} à ${ROOM_NAME_MAX} caractères.` })
      return focusField('name')
    }
    if (styles.length === 0) {
      return setErrors({ styles: 'Choisis au moins un style de musique.' })
    }

    setErrors({})
    setBusy(true)
    const result = await onSubmit({ name: trimmed, description: oneLine(description), styles, theme, rules })
    setBusy(false)
    if (result.ok) return
    const field = roomErrorField(result)
    setErrors({ [field ?? 'form']: roomErrorMessage(result) })
    focusField(field)
  }

  return (
    <form className="room-form" onSubmit={handleSubmit} noValidate>
      <div className="room-form__card">
        <h2>Les réglages de la room</h2>

        <div className="room-form__field">
          <div className="room-form__label-row">
            <label htmlFor="room-name">Nom de la room</label>
            <span className="room-form__counter" id="room-name-count">
              {codePoints(name)} / {ROOM_NAME_MAX}
            </span>
          </div>
          <input
            ref={nameField}
            id="room-name"
            type="text"
            value={name}
            maxLength={ROOM_NAME_MAX * 2}
            autoComplete="off"
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name ? 'room-name-error room-name-count' : 'room-name-count'}
            onChange={(event) => {
              setName(event.target.value)
              setErrors((previous) => ({ ...previous, name: undefined }))
            }}
          />
          {errors.name && (
            <p id="room-name-error" className="room-form__error" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        <div className="room-form__field">
          <div className="room-form__label-row">
            <label htmlFor="room-description">Description</label>
            <span className="room-form__counter" id="room-description-count">
              {codePoints(description)} / {ROOM_DESCRIPTION_MAX}
            </span>
          </div>
          <textarea
            ref={descriptionField}
            id="room-description"
            rows={3}
            value={description}
            maxLength={ROOM_DESCRIPTION_MAX * 2}
            aria-invalid={errors.description !== undefined}
            aria-describedby={errors.description ? 'room-description-error room-description-count' : 'room-description-count'}
            onChange={(event) => {
              // One line: the Enter key does not start a second one.
              setDescription(event.target.value.replace(/\s*\n\s*/g, ' '))
              setErrors((previous) => ({ ...previous, description: undefined }))
            }}
          />
          {errors.description && (
            <p id="room-description-error" className="room-form__error" role="alert">
              {errors.description}
            </p>
          )}
        </div>

        <fieldset className="room-form__rule" aria-describedby={errors.styles ? 'room-styles-error' : undefined}>
          <legend>
            <span>Style de musique</span>
            <small>Jusqu'à {ROOM_STYLES_MAX} styles</small>
          </legend>
          <div className="room-form__chips">
            {ROOM_STYLES.map((style) => {
              const checked = styles.includes(style)
              return (
                <label key={style} className="room-form__chip">
                  <input
                    type="checkbox"
                    checked={checked}
                    // The fourth cannot be ticked: the others must be taken off first.
                    disabled={!checked && styles.length >= ROOM_STYLES_MAX}
                    onChange={() => toggleStyle(style)}
                  />
                  <span>{STYLE_LABELS[style]}</span>
                </label>
              )
            })}
          </div>
          {errors.styles && (
            <p id="room-styles-error" className="room-form__error" role="alert">
              {errors.styles}
            </p>
          )}
        </fieldset>

        <fieldset className="room-form__rule" aria-describedby={errors.theme ? 'room-theme-error' : undefined}>
          <legend>
            <span>Ambiance de la scène</span>
          </legend>
          <div className="room-form__themes">
            {ROOM_THEMES.map((candidate) => (
              <label key={candidate} className="room-form__theme">
                <input type="radio" name="room-theme" checked={theme === candidate} onChange={() => setTheme(candidate)} />
                <span className="room-form__swatch" data-theme={themeAttribute(candidate)} aria-hidden="true" />
                <span>{THEME_LABELS[candidate]}</span>
              </label>
            ))}
          </div>
          {errors.theme && (
            <p id="room-theme-error" className="room-form__error" role="alert">
              {errors.theme}
            </p>
          )}
        </fieldset>

        <div className="room-form__rules">
          <h3>Règles de la room</h3>
          <Choice<number | null>
            legend="Durée max d'un morceau"
            hint="Chaque salon fixe sa limite"
            name="room-max-track"
            choices={ROOM_MAX_TRACK_CHOICES}
            value={maxTrackSec}
            label={maxTrackLabel}
            onChange={setMaxTrackSec}
            error={errors.rules}
          />
          <Choice<number | null>
            legend="Pas de doublon pendant"
            hint="Un morceau ne revient pas avant"
            name="room-repeat"
            choices={ROOM_REPEAT_CHOICES}
            value={repeatDelaySec}
            label={repeatLabel}
            onChange={setRepeatDelaySec}
          />
          <Choice<number>
            legend="DJ max dans la file"
            hint="Au-delà, la file est complète"
            name="room-max-djs"
            choices={ROOM_MAX_DJS_CHOICES}
            value={maxDjs}
            label={String}
            onChange={setMaxDjs}
          />
        </div>
      </div>

      <aside className="room-form__side">
        <section aria-labelledby="room-preview-title">
          <h2 id="room-preview-title" className="room-form__side-title">
            Aperçu dans la liste des rooms
          </h2>
          <RoomCard
            preview
            room={{
              id: 'preview',
              name,
              description: oneLine(description),
              styles,
              theme,
              host: hostPseudo,
              rules,
              online: 0,
              nowPlaying: null,
              djs: 0,
              maxDjs,
            }}
          />
        </section>

        <section className="room-form__host" aria-labelledby="room-host-title">
          <h2 id="room-host-title">{hostTitle}</h2>
          <p className="room-form__host-account">{hostPseudo} · compte connecté</p>
          <ul>
            <li>Tu modéreras le chat et la file des DJ (les outils arrivent bientôt).</li>
            <li>Tu peux changer ces réglages à tout moment.</li>
            <li>Tu peux supprimer la room quand tu veux.</li>
          </ul>
        </section>

        {errors.form && (
          <p className="room-form__error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="room-form__actions">
          <button type="button" className="room-form__cancel" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Un instant…' : submitLabel}
          </button>
        </div>
        {children}
      </aside>
    </form>
  )
}
