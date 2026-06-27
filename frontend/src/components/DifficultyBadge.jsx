const colorMap = {
  easy: 'badge-success',
  medium: 'badge-warning',
  hard: 'badge-error',
};

function DifficultyBadge({ difficulty }) {
  return (
    <span className={`badge badge-sm capitalize ${colorMap[difficulty] ?? ''}`}>
      {difficulty}
    </span>
  );
}

export default DifficultyBadge;
