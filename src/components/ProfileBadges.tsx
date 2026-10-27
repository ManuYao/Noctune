import type { BadgeKind, BadgeState } from '../../shared/badges'
import BadgeIcon, { type BadgeTone } from './BadgeIcon'
import '../pages/PageKit.css'
import './ProfileBadges.css'

const KIND_LABELS: Record<Exclude<BadgeKind, 'tiered'>, string> = { unique: 'Unique', rare: 'Rare', hidden: 'Caché' }
const KIND_TONES: Record<Exclude<BadgeKind, 'tiered'>, BadgeTone> = { unique: 'unique', rare: 'rare', hidden: 'hidden' }

/** What a screen reader hears about a card, since its icons are drawings. */
function spokenState(badge: BadgeState): string {
  if (badge.secret) return 'Badge caché, pas encore débloqué.'
  if (badge.kind === 'tiered') {
    return badge.level === 0 ? 'Pas encore débloqué.' : `Niveau ${badge.level} sur ${badge.tiers.length} atteint.`
  }
  return badge.level > 0 ? 'Débloqué.' : 'Pas encore débloqué.'
}

function BadgeCard({ badge }: { badge: BadgeState }) {
  const tiered = badge.kind === 'tiered'
  const percent = badge.next ? Math.min(100, Math.round((badge.value / badge.next) * 100)) : 100
  return (
    <li className={`badge-card${badge.level > 0 ? ' badge-card--earned' : ''}${badge.secret ? ' badge-card--secret' : ''}`}>
      <div className="badge-card__icons">
        {tiered ? (
          badge.tiers.map((tier, index) => (
            <div className="badge-card__icon" key={tier.threshold}>
              <BadgeIcon id={badge.id} tone={`tier${index + 1}` as BadgeTone} state={badge.level > index ? 'earned' : 'locked'} />
              <span>{tier.label}</span>
            </div>
          ))
        ) : (
          <div className="badge-card__icon">
            <BadgeIcon id={badge.id} tone={KIND_TONES[badge.kind as Exclude<BadgeKind, 'tiered'>]} state={badge.secret ? 'secret' : badge.level > 0 ? 'earned' : 'locked'} />
            <span>{KIND_LABELS[badge.kind as Exclude<BadgeKind, 'tiered'>]}</span>
          </div>
        )}
      </div>
      <h3 className="badge-card__name">{badge.secret ? '???' : badge.name}</h3>
      <p className="badge-card__text">{badge.secret ? 'Il se dévoile quand tu le débloques.' : badge.description}</p>
      <span className="visually-hidden">{spokenState(badge)}</span>
      {tiered && badge.next !== null && (
        <div className="badge-card__progress">
          <div className="badge-card__bar" aria-hidden="true">
            <div style={{ width: `${percent}%` }} />
          </div>
          <span>
            {badge.value}/{badge.next}
            {badge.id === 'veteran' ? ' mois' : ''} · niveau {badge.level + 1}
          </span>
        </div>
      )}
      {tiered && badge.next === null && <p className="badge-card__done">Niveau maximum</p>}
      {!tiered && !badge.secret && <p className="badge-card__done">{badge.level > 0 ? 'Débloqué' : 'À débloquer'}</p>}
    </li>
  )
}

/** The badges of mock-up 9 on the profile: every level, the ones reached coloured, the next ones greyed with a padlock. */
export default function ProfileBadges({ badges, failed }: { badges: BadgeState[] | null; failed: boolean }) {
  const earned = badges ? badges.filter((badge) => badge.level > 0).length : 0
  return (
    <section className="profile-badges" aria-labelledby="profile-badges-title">
      <div className="profile-badges__head">
        <h2 className="profile-badges__title" id="profile-badges-title">
          Badges
        </h2>
        <p className="profile-badges__count" role="status">
          {badges
            ? `${earned} badge${earned > 1 ? 's' : ''} sur ${badges.length}`
            : failed
              ? 'Tes badges ne sont pas disponibles pour l\x27instant.'
              : 'Calcul de tes badges…'}
        </p>
      </div>
      <p className="profile-badges__note">Réservés aux comptes · aucun effet sur le vote ni sur la file.</p>
      {badges && (
        <ul className="profile-badges__grid">
          {badges.map((badge) => (
            <BadgeCard badge={badge} key={badge.id} />
          ))}
        </ul>
      )}
    </section>
  )
}
