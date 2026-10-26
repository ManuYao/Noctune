import { approxTextWidth, cutText } from './sceneText'

interface SceneConsoleProps {
  /** Pseudo of the DJ whose track plays, for the plate on the front; null while the room plays its own selection. */
  djName: string | null
}

/**
 * The DJ console of the mock-ups: two turntables, a mixer, and a plate "DJ <pseudo>" in cyan on its front. It is drawn
 * after the DJ, so that it hides their feet: the DJ stands behind it.
 */
export default function SceneConsole({ djName }: SceneConsoleProps) {
  const plate = djName === null ? null : cutText(`DJ ${djName}`, 26)
  const plateWidth = plate === null ? 0 : Math.min(190, Math.max(60, approxTextWidth(plate, 12) + 18))
  return (
    <g>
      <rect x="370" y="362" width="200" height="40" rx="6" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <ellipse cx="422" cy="362" rx="28" ry="7" fill="#16142B" />
      <ellipse cx="422" cy="362" rx="7" ry="1.8" className="sc-accent" />
      <ellipse cx="518" cy="362" rx="28" ry="7" fill="#16142B" />
      <ellipse cx="518" cy="362" rx="7" ry="1.8" className="sc-accent" />
      <rect x="448" y="354" width="44" height="12" rx="3" fill="#16142B" />
      <circle cx="458" cy="360" r="2.3" className="sc-accent2" />
      <circle cx="470" cy="360" r="2.3" className="sc-accent2" />
      <circle cx="482" cy="360" r="2.3" className="sc-accent2" />
      {plate !== null && (
        <>
          <rect x={470 - plateWidth / 2} y="376" width={plateWidth} height="18" rx="4" fill="#16142B" />
          <text x="470" y="389" textAnchor="middle" className="scene__text scene__text--plate">
            {plate}
          </text>
        </>
      )}
    </g>
  )
}
