function JsonImportSection({ jsonText, setJsonText, jsonError, onLoad }) {
  return (
    <section className="card bg-base-100 border border-base-200">
      <div className="card-body gap-4">
        <p className="text-sm text-base-content/60">
          Paste a problem object (or an array — the first item is used) in the
          same shape as <code className="font-mono">questions.json</code>:
          {' '}<code className="font-mono">tags</code> as an array,{' '}
          <code className="font-mono">startCode</code> /{' '}
          <code className="font-mono">referenceSolution</code> as{' '}
          <code className="font-mono">{'{ language, ... }'}</code> entries. It’s
          validated and loaded into the form for review before you submit.
        </p>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={16}
          className="textarea textarea-bordered w-full font-mono text-sm"
          placeholder='{ "title": "Two Sum", "description": "...", "difficulty": "easy", "tags": ["array"], ... }'
        />
        {jsonError && (
          <div className="alert alert-error text-sm whitespace-pre-wrap">{jsonError}</div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onLoad}
          disabled={!jsonText.trim()}
        >
          Load into form
        </button>
      </div>
    </section>
  );
}

export default JsonImportSection;
