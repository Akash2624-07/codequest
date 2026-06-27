const DIFFICULTIES = ['all', 'easy', 'medium', 'hard'];
const STATUSES = ['all', 'solved', 'unsolved'];

function FilterBar({ difficulty, setDifficulty, status, setStatus, availableTags, selectedTags, toggleTag }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Difficulty */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-base-content/50 w-16 shrink-0">Difficulty</span>
        <div className="join">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`join-item btn btn-sm capitalize ${difficulty === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-base-content/50 w-16 shrink-0">Status</span>
        <div className="join">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`join-item btn btn-sm capitalize ${status === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {availableTags.length > 0 && (
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-sm font-medium text-base-content/50 w-16 shrink-0 mt-1">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`badge badge-md cursor-pointer transition-colors ${
                  selectedTags.has(tag) ? 'badge-primary' : 'badge-outline hover:badge-primary'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
