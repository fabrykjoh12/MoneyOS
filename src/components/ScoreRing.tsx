export function ScoreRing({ score, size = 34, onClick }: { score: number; size?: number; onClick?: () => void }) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  return (
    <button
      className="icon-btn score-ring"
      onClick={onClick}
      aria-label={`Steady Score ${score} of 100 — tap to see why`}
      style={{ width: size + 6, height: size + 6 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="54%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={size * 0.34}
          fontWeight="650"
          fill="var(--ink)"
          className="num"
        >
          {score}
        </text>
      </svg>
    </button>
  )
}
