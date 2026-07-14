import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function TestcaseConsole({ testCases, runResult, runLoading, runError }) {
  const [selected, setSelected] = useState(0);

  const tc = testCases[selected];
  const result = runResult?.[selected];

  return (
    <div className="flex flex-col gap-3 text-sm h-full">
      {/* Case selector */}
      <div className="flex gap-2 flex-wrap shrink-0">
        {testCases.map((_, i) => {
          const r = runResult?.[i];
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`btn btn-sm gap-1 ${selected === i ? 'btn-neutral' : 'btn-ghost'}`}
            >
              {r && (r.passed
                ? <CheckCircle2 size={12} className="text-success" />
                : <XCircle size={12} className="text-error" />)}
              Case {i + 1}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {runLoading ? (
        <div className="flex items-center gap-2 text-base-content/50">
          <span className="loading loading-spinner loading-sm" /> Running…
        </div>
      ) : runError ? (
        <p className="text-error text-xs">{runError}</p>
      ) : (
        <div className="flex flex-col gap-3 font-mono text-xs overflow-y-auto">
          <div>
            <p className="text-base-content/50 font-sans mb-1">Input</p>
            <div className="bg-base-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{tc.input}</div>
          </div>

          <div>
            <p className="text-base-content/50 font-sans mb-1">Expected Output</p>
            <div className="bg-base-200 rounded-lg px-3 py-2">{tc.output}</div>
          </div>

          {result && (
            <div>
              <p className={`font-sans mb-1 ${result.passed ? 'text-success' : 'text-error'}`}>
                Output {result.passed ? '✓' : '✗'}
              </p>
              <div className={`rounded-lg px-3 py-2 ${result.passed ? 'bg-success/10' : 'bg-error/10'}`}>
                {result.actualOutput ?? '—'}
              </div>
              {result.errorMessage && (
                <p className="text-error whitespace-pre-wrap font-sans mt-2 text-xs">
                  {result.errorMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
