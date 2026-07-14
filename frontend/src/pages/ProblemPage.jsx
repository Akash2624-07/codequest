import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import frontendClient from '../utils/axiosInstance';
import DescriptionPanel from '../components/problem/DescriptionPanel';
import SubmissionsPanel from '../components/problem/SubmissionsPanel';
import SubmitResultPanel from '../components/problem/SubmitResultPanel';
import EditorPanel from '../components/problem/EditorPanel';

const LEFT_TABS = ['description', 'editorial', 'solution', 'submissions', 'result'];

function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-base-content/40 select-none">
      <span className="text-5xl">🚧</span>
      <p className="font-semibold text-base">Coming Soon</p>
      <p className="text-sm text-center max-w-xs">
        This feature is under development and will be available soon.
      </p>
    </div>
  );
}

export default function ProblemPage() {
  const { id } = useParams();

  // ── Problem data (local — not needed anywhere else in the app) ──────────────
  const [problem, setProblem] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  // ── Editor state (local — scoped to this page) ──────────────────────────────
  // Code stored per-language so switching back preserves edits.
  const [language, setLanguage] = useState('cpp');
  const [codeByLang, setCodeByLang] = useState({});

  // ── Left panel ──────────────────────────────────────────────────────────────
  const [leftTab, setLeftTab] = useState('description');

  // Passed to SubmissionsPanel so it can merge new submissions without refetching
  const [latestSubmission, setLatestSubmission] = useState(null);

  // ── Run state ───────────────────────────────────────────────────────────────
  const [runResult, setRunResult] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState(null);

  // ── Submit state ────────────────────────────────────────────────────────────
  const [submitResult, setSubmitResult] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // ── Bottom console ──────────────────────────────────────────────────────────
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    frontendClient
      .get(`/problems/${id}`)
      .then(({ data }) => {
        setProblem(data);
        const initial = {};
        for (const { language: lang, initialCode } of data.startCode) {
          initial[lang] = initialCode;
        }
        setCodeByLang(initial);
        setLanguage(data.startCode[0]?.language ?? 'cpp');
      })
      .catch(() => setPageError('Failed to load problem.'))
      .finally(() => setPageLoading(false));
  }, [id]);

  const currentCode = codeByLang[language] ?? '';
  const handleCodeChange = (val) =>
    setCodeByLang((prev) => ({ ...prev, [language]: val ?? '' }));

  const handleRun = async () => {
    setRunLoading(true);
    setRunError(null);
    setRunResult(null);
    setConsoleOpen(true);
    try {
      const { data } = await frontendClient.post(`/problems/${id}/run`, { code: currentCode, language });
      setRunResult(data);
    } catch (err) {
      const d = err.response?.data;
      setRunError((typeof d === 'string' ? d : d?.message) ?? 'Run failed');
    } finally {
      setRunLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitResult(null);
    setLeftTab('result'); // auto-switch left panel to show submission verdict
    try {
      const { data } = await frontendClient.post(`/problems/${id}/submit`, { code: currentCode, language });
      setSubmitResult(data);
      setLatestSubmission(data);
    } catch (err) {
      const d = err.response?.data;
      setSubmitError((typeof d === 'string' ? d : d?.message) ?? 'Submit failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (pageLoading)
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );

  if (pageError)
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <p className="text-error">{pageError}</p>
      </div>
    );

  const availableLanguages = problem.startCode.map((s) => s.language);
  const busy = runLoading || submitLoading;

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-4rem)] bg-base-200 gap-1.5 p-1.5">

      {/* ── LEFT PANEL ───────────────────────────────────────────────────────── */}
      <div className="lg:w-[45%] flex flex-col bg-base-100 rounded-xl border border-base-200 overflow-hidden min-h-[40vh] lg:min-h-0">

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-base-200 overflow-x-auto">
          {LEFT_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setLeftTab(tab)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 ${
                leftTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/50 hover:text-base-content'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {leftTab === 'description'  && <DescriptionPanel problem={problem} />}
          {leftTab === 'editorial'    && <ComingSoon />}
          {leftTab === 'solution'     && <ComingSoon />}
          {leftTab === 'submissions'  && (
            <SubmissionsPanel problemId={id} newSubmission={latestSubmission} />
          )}
          {leftTab === 'result'       && (
            <SubmitResultPanel
              result={submitResult}
              loading={submitLoading}
              error={submitError}
            />
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────────── */}
      <EditorPanel
        language={language}
        setLanguage={setLanguage}
        availableLanguages={availableLanguages}
        code={currentCode}
        onCodeChange={handleCodeChange}
        testCases={problem.visibleTestCase}
        runResult={runResult}
        runLoading={runLoading}
        runError={runError}
        consoleOpen={consoleOpen}
        setConsoleOpen={setConsoleOpen}
        onRun={handleRun}
        onSubmit={handleSubmit}
        submitLoading={submitLoading}
        busy={busy}
      />
    </div>
  );
}
