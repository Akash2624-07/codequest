function BasicsSection({ register, errors }) {
  return (
    <section className="card bg-base-100 border border-base-200">
      <div className="card-body gap-4">
        <h2 className="font-semibold text-lg">Basics</h2>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Title</legend>
          <input
            {...register('title')}
            className={`input input-bordered w-full ${errors.title ? 'input-error' : ''}`}
            placeholder="Two Sum"
          />
          {errors.title && <p className="fieldset-label text-error">{errors.title.message}</p>}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Description</legend>
          <textarea
            {...register('description')}
            rows={5}
            className={`textarea textarea-bordered w-full ${errors.description ? 'textarea-error' : ''}`}
            placeholder="Describe the problem, constraints, and examples…"
          />
          {errors.description && (
            <p className="fieldset-label text-error">{errors.description.message}</p>
          )}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Difficulty</legend>
            <select
              {...register('difficulty')}
              className="select select-bordered w-full capitalize"
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Tags</legend>
            <input
              {...register('tags')}
              className={`input input-bordered w-full ${errors.tags ? 'input-error' : ''}`}
              placeholder="array, hash-table"
            />
            {errors.tags ? (
              <p className="fieldset-label text-error">{errors.tags.message}</p>
            ) : (
              <p className="fieldset-label">Comma-separated</p>
            )}
          </fieldset>
        </div>
      </div>
    </section>
  );
}

export default BasicsSection;
