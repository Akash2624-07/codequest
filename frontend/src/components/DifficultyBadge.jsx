const colorMap = {
  easy: 'badge-success',
  medium: 'badge-warning',
  hard: 'badge-error',
};

const levelMap = {
  easy: 1,
  medium: 2,
  hard: 3,
};

function DifficultyBadge({ difficulty }) {
  const level = levelMap[difficulty] ?? 0;

  return (
    <span className={`badge badge-soft badge-sm capitalize gap-1.5 ${colorMap[difficulty] ?? ''}`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={i < level ? 'bg-current' : 'bg-current/25'}
            style={{ width: 3, height: 4 + i * 3, borderRadius: 1 }}
          />
        ))}
      </span>
      {difficulty}
    </span>
  );
}

export default DifficultyBadge;
