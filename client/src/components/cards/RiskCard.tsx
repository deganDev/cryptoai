type RiskCardProps = {
  level: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  flags: string[];
};

export default function RiskCard({ level, score, flags }: RiskCardProps) {
  return (
    <div className="card risk-card">
      <div className={`risk-badge ${level.toLowerCase()}`}>{level} RISK</div>
      <div className="risk-score">Score {score}/100</div>
      <ul className="risk-flags">
        {flags.map((flag) => (
          <li key={flag}>{flag}</li>
        ))}
      </ul>
    </div>
  );
}
