import { Plus, Trash2 } from 'lucide-react';

// Shared by Visible and Hidden test cases — Visible additionally collects an
// `explanation` per case, toggled with `showExplanation`.
function TestCaseSection({ title, basePath, fieldArray, register, errors, showExplanation = false }) {
  const sectionErrors = errors[basePath];

  return (
    <section className="card bg-base-100 border border-base-200">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() =>
              fieldArray.append(
                showExplanation
                  ? { input: '', output: '', explanation: '' }
                  : { input: '', output: '' },
              )
            }
          >
            <Plus size={15} /> Add
          </button>
        </div>
        {sectionErrors?.root && (
          <p className="text-error text-sm">{sectionErrors.root.message}</p>
        )}

        {fieldArray.fields.map((field, i) => (
          <div key={field.id} className="border border-base-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-base-content/50">Case {i + 1}</span>
              {fieldArray.fields.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-error"
                  onClick={() => fieldArray.remove(i)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <textarea
                {...register(`${basePath}.${i}.input`)}
                rows={2}
                className="textarea textarea-bordered w-full font-mono text-sm"
                placeholder="Input"
              />
              <textarea
                {...register(`${basePath}.${i}.output`)}
                rows={2}
                className="textarea textarea-bordered w-full font-mono text-sm"
                placeholder="Output"
              />
            </div>
            {showExplanation && (
              <textarea
                {...register(`${basePath}.${i}.explanation`)}
                rows={2}
                className="textarea textarea-bordered w-full text-sm"
                placeholder="Explanation"
              />
            )}
            {sectionErrors?.[i] && (
              <p className="text-error text-sm">
                {sectionErrors[i].input?.message ||
                  sectionErrors[i].output?.message ||
                  sectionErrors[i].explanation?.message}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default TestCaseSection;
