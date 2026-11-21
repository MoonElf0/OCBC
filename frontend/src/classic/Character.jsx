import { useId } from 'react'
import './character.css'

/**
 * The Assessment AI character. A sculpted auditor with a magnifier.
 * Palette biased to warm reds, bone whites and metallic grey — it never
 * borrows the exact OCBC brand red.
 *
 * mood: idle | watching | thinking | verified | caution | unsupported | unknown
 */
export default function Character({ mood = 'idle', className = '' }) {
  const uid = useId().replace(/:/g, '')
  const g = (name) => `${name}-${uid}`
  const url = (name) => `url(#${g(name)})`

  return (
    <svg viewBox="0 0 240 240" className={`character mood-${mood} ${className}`} role="img" aria-label={`Assessment AI character, ${MOOD_LABEL[mood]}`}>
      <defs>
        <radialGradient id={g('bone')} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#efe9e1" />
          <stop offset="100%" stopColor="#cfc6bb" />
        </radialGradient>
        <radialGradient id={g('red')} cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#ee7a5c" />
          <stop offset="45%" stopColor="#cf3f2b" />
          <stop offset="100%" stopColor="#8a2219" />
        </radialGradient>
        <linearGradient id={g('metal')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6e8eb" />
          <stop offset="45%" stopColor="#9aa0a6" />
          <stop offset="100%" stopColor="#5d6268" />
        </linearGradient>
        <linearGradient id={g('visor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3e43" />
          <stop offset="100%" stopColor="#141517" />
        </linearGradient>
        <radialGradient id={g('glass')} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#c9d6e0" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      <ellipse className="shadow" cx="120" cy="224" rx="50" ry="7" fill="#000" opacity="0.12" />

      <g className="whole">
        {/* Legs and boots */}
        <rect x="99" y="182" width="16" height="30" rx="8" fill={url('bone')} />
        <rect x="125" y="182" width="16" height="30" rx="8" fill={url('bone')} />
        <ellipse cx="106" cy="214" rx="15" ry="8" fill={url('metal')} />
        <ellipse cx="134" cy="214" rx="15" ry="8" fill={url('metal')} />

        {/* Body */}
        <ellipse cx="120" cy="164" rx="41" ry="36" fill={url('bone')} />
        <ellipse cx="120" cy="134" rx="33" ry="7" fill={url('metal')} />
        <circle className="core" cx="120" cy="166" r="9" />
        <circle cx="117" cy="163" r="3" fill="#fff" opacity="0.6" />

        {/* Left arm */}
        <g className="arm-left">
          <rect x="66" y="140" width="18" height="38" rx="9" fill={url('red')} transform="rotate(18 80 145)" />
          <circle cx="68" cy="178" r="10" fill={url('red')} />
        </g>

        {/* Right arm with magnifier */}
        <g className="arm-right">
          <rect x="158" y="132" width="18" height="36" rx="9" fill={url('red')} transform="rotate(-34 160 150)" />
          <line x1="178" y1="124" x2="188" y2="106" stroke={url('metal')} strokeWidth="6" strokeLinecap="round" />
          <circle cx="180" cy="126" r="9" fill={url('red')} />
          <circle cx="197" cy="90" r="17" fill={url('glass')} stroke={url('metal')} strokeWidth="5" />
          <path d="M187 84 a12 12 0 0 1 9 -8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
        </g>

        {/* Head */}
        <g className="head">
          <line x1="120" y1="40" x2="120" y2="20" stroke={url('metal')} strokeWidth="4" strokeLinecap="round" />
          <circle className="bulb" cx="120" cy="16" r="7" fill={url('red')} />
          <circle cx="118" cy="14" r="2" fill="#fff" opacity="0.7" />

          <path d="M70 96 Q60 84 64 70 Q74 80 80 90 Z" fill={url('red')} />
          <path d="M170 96 Q180 84 176 70 Q166 80 160 90 Z" fill={url('red')} />
          <circle cx="120" cy="86" r="50" fill={url('bone')} />
          <path d="M70 84 C72 36 168 36 170 84 C152 66 88 66 70 84 Z" fill={url('red')} />
          <path d="M92 52 C104 44 126 42 140 47" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.35" />

          <rect x="83" y="74" width="74" height="42" rx="21" fill={url('visor')} />
          <path d="M95 80 C104 77 118 76 128 77" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.18" />

          <ellipse className="cheek" cx="90" cy="124" rx="7" ry="3.5" fill="#d2452f" />
          <ellipse className="cheek" cx="150" cy="124" rx="7" ry="3.5" fill="#d2452f" />

          {/* Eyes: one set per mood family, toggled with CSS */}
          <g className="eyes eyes-open">
            <g className="pupils">
              <rect x="101" y="87" width="11" height="17" rx="5.5" fill="#fff" />
              <rect x="128" y="87" width="11" height="17" rx="5.5" fill="#fff" />
            </g>
          </g>
          <g className="eyes eyes-happy" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round">
            <path d="M100 99 Q106.5 89 113 99" />
            <path d="M127 99 Q133.5 89 140 99" />
          </g>
          <g className="eyes eyes-doubt">
            <rect x="101" y="91" width="11" height="12" rx="5" fill="#fff" />
            <rect x="128" y="87" width="11" height="17" rx="5.5" fill="#fff" />
            <path d="M99 86 L114 89" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="eyes eyes-worried">
            <rect x="101" y="91" width="11" height="13" rx="5.5" fill="#fff" />
            <rect x="128" y="91" width="11" height="13" rx="5.5" fill="#fff" />
            <path d="M99 88 L113 84" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <path d="M141 88 L127 84" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>

        {/* Thought mark for "unknown" */}
        <g className="question">
          <circle cx="174" cy="40" r="15" fill="#fff" stroke="#e5e7eb" />
          <text x="174" y="46" textAnchor="middle" fontSize="18" fontWeight="600" fill="#7c7e83" fontFamily="Inter, sans-serif">?</text>
        </g>
      </g>
    </svg>
  )
}

const MOOD_LABEL = {
  idle: 'waiting for an answer',
  watching: 'reading the answer',
  thinking: 'running checks',
  verified: 'satisfied',
  caution: 'cautious',
  unsupported: 'concerned',
  unknown: 'unsure',
}

/** Head-only mark for small avatars. */
export function CharacterMark({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="17" r="12" fill="#efe9e1" />
      <path d="M4.5 15 C5 5 27 5 27.5 15 C23 11 9 11 4.5 15 Z" fill="#cf3f2b" />
      <rect x="8" y="14" width="16" height="9" rx="4.5" fill="#25282b" />
      <rect x="11.5" y="16" width="2.6" height="4.2" rx="1.3" fill="#fff" />
      <rect x="17.9" y="16" width="2.6" height="4.2" rx="1.3" fill="#fff" />
      <circle cx="16" cy="3.5" r="2.2" fill="#cf3f2b" />
      <line x1="16" y1="5.5" x2="16" y2="8" stroke="#9aa0a6" strokeWidth="1.4" />
    </svg>
  )
}
