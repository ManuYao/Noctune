import { BUBBLE_HEIGHT, TAG_HEIGHT, type BubbleLayout } from './bubbleGeometry'

const OUTLINE = '#16142B'

interface SceneBubbleProps {
  /** What they just said, already cut to a short line. */
  text: string
  /** Where it goes (see layoutBubble). */
  layout: BubbleLayout
}

/**
 * A chat bubble over somebody of the crowd, as in the mock-ups: white, outlined, with its tail, and the person's name in a
 * dark tag. Only decoration: the chat says the same in full, readable by everybody.
 */
export default function SceneBubble({ text, layout }: SceneBubbleProps) {
  const { bubble, tail, tag } = layout
  return (
    <g className="scene__bubble">
      {tag && (
        <>
          <rect x={tag.x - tag.width / 2} y={tag.y} width={tag.width} height={TAG_HEIGHT} rx="10" fill={OUTLINE} opacity="0.88" />
          <text x={tag.x} y={tag.y + 14} textAnchor="middle" className="scene__text scene__text--tag">
            {tag.label}
          </text>
        </>
      )}
      <rect x={bubble.left} y={bubble.top} width={bubble.width} height={BUBBLE_HEIGHT} rx="12" fill="#FFFFFF" stroke={OUTLINE} strokeWidth="2.5" />
      <polygon points={tail.points} fill="#FFFFFF" stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x={tail.cover.x} y={tail.cover.y} width={tail.cover.width} height={tail.cover.height} fill="#FFFFFF" />
      <text x={bubble.left + bubble.width / 2} y={bubble.top + 21} textAnchor="middle" className="scene__text scene__text--bubble">
        {text}
      </text>
    </g>
  )
}
