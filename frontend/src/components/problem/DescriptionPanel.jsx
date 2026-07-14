import DifficultyBadge from '../DifficultyBadge';

export default function DescriptionPanel({ problem }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold mb-2">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          {problem.tags.map((tag) => (
            <span key={tag} className="badge badge-outline badge-sm">{tag}</span>
          ))}
        </div>
      </div>

      <div className="text-sm text-base-content/80 whitespace-pre-wrap leading-relaxed">
        {problem.description}
      </div>

      {problem.visibleTestCase.map((tc, i) => (
        <div key={i}>
          <p className="text-sm font-semibold mb-2">Example {i + 1}</p>
          <div className="bg-base-200 rounded-lg p-3 font-mono text-xs flex flex-col gap-1.5">
            <div>
              <span className="text-base-content/50">Input: </span>
              <span className="whitespace-pre-wrap">{tc.input}</span>
            </div>
            <div>
              <span className="text-base-content/50">Output: </span>
              <span>{tc.output}</span>
            </div>
            {tc.explanation && (
              <div className="mt-1 font-sans text-xs text-base-content/70">
                <span className="font-semibold">Explanation: </span>{tc.explanation}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
