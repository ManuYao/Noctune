interface SpeakerIconProps {
  muted: boolean
}

// The speaker of the mock-ups' bar (22 x 22), crossed out when the sound is off.
export default function SpeakerIcon({ muted }: SpeakerIconProps) {
  return (
    <svg
      viewBox="0 0 22 22"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8 H6 L11 4 V18 L6 14 H3 Z" />
      {muted ? <path d="M15 8.5 L20 13.5 M20 8.5 L15 13.5" /> : <path d="M15 8 C17 10 17 12 15 14" />}
    </svg>
  )
}
