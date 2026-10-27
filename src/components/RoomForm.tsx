import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
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
import { findAvatar } from '../data/avatars'
import type { RoomCallFailure } from '../rooms/roomApi'
import { STYLE_LABELS, THEME_LABELS, maxTrackLabel, repeatLabel, themeAttribute } from '../rooms/roomLabels'
import { roomErrorField, roomErrorMessage, type RoomField } from '../rooms/roomMessages'
import Avatar from './Avatar'
import RoomFormPreview from './RoomFormPreview'
import './RoomForm.css'

interface RoomFormProps {
  initial: RoomSettings
  /** Pseudo and avatar of the host, for the preview card and the box under it. */
  hostPseudo: string
  hostAvatarId: string
  /** What the box under the preview says first: "Tu seras l'hôte" when making, "Tu es l'hôte" when changing. */
  hostTitle: string
  /** A room being made (the preview shows it empty, with a free place for a DJ, and the button a "+"). */
  fresh?: boolean
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

/** The ids that describe a group: its hint, and its error when there is one. */
const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined

function Check({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M2.5 6.2 L5 8.7 L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface ChoiceProps<T extends number | null> {
  title: string
  hint: string
  name: string
  choices: readonly T[]
  value: T
  label: (choice: T) => string
  onChange: (choice: T) => void
  error?: string
}

/**
 * A rule of mock-up 2b: its name and hint on the left, a row of choices of which exactly one is taken. Real radio
 * buttons (hidden, drawn by their label), so that the arrow keys and screen readers work.
 */
function Choice<T extends number | null>({ title, hint, name, choices, value, label, onChange, error }: ChoiceProps<T>) {
  return (
    <div className="room-form__rule" role="radiogroup" aria-labelledby={`${name}-title`} aria-describedby={describedBy(`${name}-hint`, error && `${name}-error`)}>
      <span className="room-form__rule-name">
        <span id={`${name}-title`}>{title}</span>
        <small id={`${name}-hint`}>{hint}</small>
      </span>
      <span className="room-form__segs">
        {choices.map((choice) => (
          <label key={String(choice)} className="room-form__seg">
            <input type="radio" name={name} checked={value === choice} onChange={() => onChange(choice)} />
            <span>{label(choice)}</span>
          </label>
        ))}
      </span>
      {error && (
        <p id={`${name}-error`} className="room-form__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Mock-up 2b: the settings on the left, the preview of the card, the host's role and the buttons on the right. */
export default function RoomForm({
  initial,
  hostPseudo,
  hostAvatarId,
  hostTitle,
  fresh = false,
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel = 'Annuler',
  children,
}: RoomFormProps) {
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
  const hostAvatar = findAvatar(hostAvatarId)

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
      <section className="room-form__card" aria-labelledby="room-settings-title">
        <h2 id="room-settings-title">Les réglages de ta room</h2>

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
            rows={2}
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

        <div className="room-form__field" role="group" aria-labelledby="room-styles-title" aria-describedby={describedBy('room-styles-hint', errors.styles && 'room-styles-error')}>
          <div className="room-form__label-row">
            <span id="room-styles-title" className="room-form__label">
              Style de musique
            </span>
            <span id="room-styles-hint" className="room-form__counter">
              Jusqu'à {ROOM_STYLES_MAX} styles
            </span>
          </div>
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
        </div>

        <div className="room-form__field" role="radiogroup" aria-labelledby="room-theme-title" aria-describedby={errors.theme ? 'room-theme-error' : undefined}>
          <span id="room-theme-title" className="room-form__label">
            Ambiance de la scène
          </span>
          <div className="room-form__themes">
            {ROOM_THEMES.map((candidate) => (
              <label key={candidate} className="room-form__theme">
                <input type="radio" name="room-theme" checked={theme === candidate} onChange={() => setTheme(candidate)} />
                {/* The swatch wears the colours of the ambiance it stands for: its tokens come from its own data-theme. */}
                <span className="room-form__swatch" data-theme={themeAttribute(candidate)} aria-hidden="true" />
                <span>{THEME_LABELS[candidate]}</span>
                <span className="room-form__badge" aria-hidden="true">
                  <Check />
                </span>
              </label>
            ))}
          </div>
          {errors.theme && (
            <p id="room-theme-error" className="room-form__error" role="alert">
              {errors.theme}
            </p>
          )}
        </div>

        <div className="room-form__rules" role="group" aria-labelledby="room-rules-title">
          <span id="room-rules-title" className="room-form__label">
            Règles de la room
          </span>
          <Choice<number | null>
            title="Durée max d'un morceau"
            hint="Chaque salon fixe sa limite"
            name="room-max-track"
            choices={ROOM_MAX_TRACK_CHOICES}
            value={maxTrackSec}
            label={maxTrackLabel}
            onChange={setMaxTrackSec}
            error={errors.rules}
          />
          <Choice<number | null>
            title="Pas de doublon pendant"
            hint="Un morceau ne revient pas avant"
            name="room-repeat"
            choices={ROOM_REPEAT_CHOICES}
            value={repeatDelaySec}
            label={repeatLabel}
            onChange={setRepeatDelaySec}
          />
          <Choice<number>
            title="DJ max dans la file"
            hint="Au-delà, la file est complète"
            name="room-max-djs"
            choices={ROOM_MAX_DJS_CHOICES}
            value={maxDjs}
            label={String}
            onChange={setMaxDjs}
          />
        </div>
      </section>

      <div className="room-form__side">
        <section className="room-form__preview" aria-labelledby="room-preview-title">
          <h2 id="room-preview-title">Aperçu dans la liste des rooms</h2>
          <RoomFormPreview name={name} styles={styles} theme={theme} rules={rules} hostPseudo={hostPseudo} fresh={fresh} />
        </section>

        <section className="room-form__host" aria-labelledby="room-host-title">
          <div className="room-form__host-who">
            {hostAvatar && <Avatar avatar={hostAvatar} size={44} framing="icon" decorative />}
            <div>
              <h2 id="room-host-title">{hostTitle}</h2>
              <p className="room-form__host-account">{hostPseudo} · compte connecté</p>
            </div>
          </div>
          <ul>
            <li>
              <span className="room-form__tick" aria-hidden="true">
                <Check size={11} />
              </span>
              Tu modères le chat et la file des DJ.
            </li>
            <li>
              <span className="room-form__tick" aria-hidden="true">
                <Check size={11} />
              </span>
              Tu peux changer ces réglages à tout moment.
            </li>
            <li>
              <span className="room-form__tick" aria-hidden="true">
                <Check size={11} />
              </span>
              <span>
                Les{' '}
                {/* A new tab: what is typed in the form stays. */}
                <Link to="/regles" target="_blank" rel="noopener noreferrer">
                  règles de la communauté<span className="visually-hidden"> (nouvel onglet)</span>
                </Link>{' '}
                valent pour toutes les rooms.
              </span>
            </li>
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
          <button type="submit" className="room-form__submit" disabled={busy}>
            {fresh && (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M8 3 V13 M3 8 H13" />
              </svg>
            )}
            {busy ? 'Un instant…' : submitLabel}
          </button>
        </div>
        {children}
      </div>
    </form>
  )
}
