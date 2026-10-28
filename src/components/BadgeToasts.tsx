import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { BadgeEarned } from '../../shared/protocol'
import { socket } from '../realtime/socket'
import BadgeIcon, { type BadgeTone } from './BadgeIcon'
import './BadgeToasts.css'
import type { BadgeId } from '../../shared/badges'

interface Toast {
  id: number
  badges: BadgeEarned[]
}

const KIND_TONES = { unique: 'unique', rare: 'rare', hidden: 'hidden' } as const
// A little longer than a notice: it is good news, and it is worth a look at the profile.
const READ_TIME_MS = 10_000
const KEPT = 3

// Where the sparkles fly (degrees, px) and when: a ring of ten, a few farther, a few late.
const SPARKLES = [
  { angle: 0, dist: 34, delay: 0 },
  { angle: 36, dist: 44, delay: 0.08 },
  { angle: 72, dist: 32, delay: 0.16 },
  { angle: 108, dist: 46, delay: 0.04 },
  { angle: 144, dist: 36, delay: 0.2 },
  { angle: 180, dist: 42, delay: 0.1 },
  { angle: 216, dist: 33, delay: 0.24 },
  { angle: 252, dist: 47, delay: 0.06 },
  { angle: 288, dist: 35, delay: 0.18 },
  { angle: 324, dist: 43, delay: 0.12 },
]

function toneOf(badge: BadgeEarned): BadgeTone {
  return badge.kind === 'tiered' ? (`tier${Math.min(3, Math.max(1, badge.level))}` as BadgeTone) : KIND_TONES[badge.kind]
}

/** "Premier son", or "Crowd pleaser · niveau 2 (50)". */
export function badgeLine(badge: BadgeEarned): string {
  return badge.kind === 'tiered' ? `${badge.name} · niveau ${badge.level} sur ${badge.levels}${badge.tierLabel ? ` (${badge.tierLabel})` : ''}` : badge.name
}

function Toast({ toast, newTab, onDismiss }: { toast: Toast; newTab: boolean; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), READ_TIME_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, onDismiss])

  const [first, ...others] = toast.badges
  const many = others.length > 0
  return (
    <li className="badge-toasts__item">
      {/* The icon pops and sparkles twice: something was unlocked. Decoration only; reduced motion switches it off (the message stays). */}
      <span className="badge-toasts__icon">
        <BadgeIcon id={first.id as BadgeId} tone={toneOf(first)} state="earned" size={48} />
        <span className="badge-toasts__sparkles" aria-hidden="true">
          {SPARKLES.map((sparkle, index) => (
            <i key={index} style={{ '--angle': `${sparkle.angle}deg`, '--dist': `${sparkle.dist}px`, '--delay': `${sparkle.delay}s` } as CSSProperties} />
          ))}
        </span>
      </span>
      <div className="badge-toasts__text">
        <strong>{many ? `${toast.badges.length} nouveaux badges !` : 'Nouveau badge !'}</strong>
        <p>{many ? toast.badges.map((badge) => badge.name).join(', ') : badgeLine(first)}</p>
        <Link to="/profil" {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          Voir mes badges{newTab && <span className="visually-hidden"> (nouvel onglet)</span>}
        </Link>
      </div>
      <button type="button" aria-label="Fermer ce message" onClick={() => onDismiss(toast.id)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}

/**
 * Tells a member, as it happens, that they earned a badge or a new level (the server sends `badge:earned` once per level).
 * A corner of the window, never over the video. The region is always in the page, so that a screen reader reads each one.
 * `newTab`: in the room, the link opens elsewhere so that the player keeps playing.
 */
export default function BadgeToasts({ newTab = false }: { newTab?: boolean }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    const onEarned = (badges: BadgeEarned[]) => {
      if (!Array.isArray(badges) || badges.length === 0) return
      // A phone shakes a little (Android; absent elsewhere, and never an error).
      try {
        navigator.vibrate?.([70, 50, 70])
      } catch {
        // Not allowed here.
      }
      setToasts((prev) => [...prev, { id: nextId.current++, badges }].slice(-KEPT))
    }
    socket.on('badge:earned', onEarned)
    return () => {
      socket.off('badge:earned', onEarned)
    }
  }, [])

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((toast) => toast.id !== id)), [])

  return (
    <div className="badge-toasts" role="status" aria-live="polite">
      <ul>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} newTab={newTab} onDismiss={dismiss} />
        ))}
      </ul>
    </div>
  )
}
