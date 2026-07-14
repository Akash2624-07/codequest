import { Plus, Trash2, Layers } from 'lucide-react';
import { LANGUAGES, LANGUAGE_LABELS } from '../../schemas/problemSchema';

// Shared by Starter Code and Reference Solutions — they differ only in which
// code field they write to (`initialCode` vs `completeCode`) and their copy.
function CodeLanguageSection({
  title,
  helperText,
  basePath,
  codeField,
  fieldArray,
  register,
  errors,
  onAdd,
  onAddAll,
  rows = 5,
  placeholder,
}) {
  const sectionErrors = errors[basePath];

  return (
    <section className="card bg-base-100 border border-base-200">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onAddAll}>
              <Layers size={15} /> All languages
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onAdd}>
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
        {helperText && <p className="text-sm text-base-content/50">{helperText}</p>}

        {fieldArray.fields.map((field, i) => (
          <div key={field.id} className="border border-base-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <select
                {...register(`${basePath}.${i}.language`)}
                className="select select-bordered select-sm w-40"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
                ))}
              </select>
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
            <textarea
              {...register(`${basePath}.${i}.${codeField}`)}
              rows={rows}
              className="textarea textarea-bordered w-full font-mono text-sm"
              placeholder={placeholder}
            />
            {sectionErrors?.[i]?.[codeField] && (
              <p className="text-error text-sm">{sectionErrors[i][codeField].message}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default CodeLanguageSection;
