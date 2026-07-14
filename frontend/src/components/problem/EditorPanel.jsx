import Editor from '@monaco-editor/react';
import { Play, Send, ChevronUp, ChevronDown } from 'lucide-react';
import TestcaseConsole from './TestcaseConsole';
import { LANGUAGE_LABELS } from '../../schemas/problemSchema';

// Maps our language keys to Monaco's identifiers (identical here but explicit)
const MONACO_LANG = { cpp: 'cpp', c: 'c', java: 'java', python: 'python', javascript: 'javascript' };

function EditorPanel({
  language,
  setLanguage,
  availableLanguages,
  code,
  onCodeChange,
  testCases,
  runResult,
  runLoading,
  runError,
  consoleOpen,
  setConsoleOpen,
  onRun,
  onSubmit,
  submitLoading,
  busy,
}) {
  return (
    <div className="flex-1 flex flex-col bg-base-100 rounded-xl border border-base-200 overflow-hidden min-h-[60vh] lg:min-h-0">
      {/* Language selector toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-base-200">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="select select-bordered select-sm w-40"
        >
          {availableLanguages.map((l) => (
            <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>
          ))}
        </select>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={MONACO_LANG[language]}
          value={code}
          onChange={onCodeChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* Testcase console (collapsible) */}
      {consoleOpen && (
        <div className="shrink-0 h-56 border-t border-base-200 flex flex-col bg-base-100">
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-base-200">
            <span className="text-xs font-medium text-base-content/60">Testcase</span>
            <button
              onClick={() => setConsoleOpen(false)}
              className="btn btn-ghost btn-xs text-base-content/40"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <TestcaseConsole
              testCases={testCases}
              runResult={runResult}
              runLoading={runLoading}
              runError={runError}
            />
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-base-200">
        <button
          className="btn btn-ghost btn-sm gap-1 text-base-content/60"
          onClick={() => setConsoleOpen((v) => !v)}
        >
          Console
          {consoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className="flex gap-2">
          <button className="btn btn-sm btn-outline" onClick={onRun} disabled={busy}>
            {runLoading
              ? <span className="loading loading-spinner loading-xs" />
              : <Play size={14} />}
            Run
          </button>
          <button className="btn btn-sm btn-primary" onClick={onSubmit} disabled={busy}>
            {submitLoading
              ? <span className="loading loading-spinner loading-xs" />
              : <Send size={14} />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditorPanel;
