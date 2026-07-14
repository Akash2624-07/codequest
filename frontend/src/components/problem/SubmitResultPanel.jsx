import { CheckCircle2, XCircle, Clock, Cpu, Bug } from 'lucide-react';

const STATUS_META = {
  accepted: {
    icon: CheckCircle2,
    emoji: '🎉',
    heading: 'Accepted!',
    subtext: 'Nailed it — every test case passed.',
    tone: 'success',
    anim: 'animate-bounce',
  },
  wrong: {
    icon: XCircle,
    emoji: '😬',
    heading: 'Wrong Answer',
    subtext: "So close! One of the test cases didn't match.",
    tone: 'error',
    anim: 'animate-pulse',
  },
  tle: {
    icon: Clock,
    emoji: '⏱️',
    heading: 'Time Limit Exceeded',
    subtext: "Your solution works, but it's too slow for this input.",
    tone: 'warning',
    anim: 'animate-pulse',
  },
  error: {
    icon: Bug,
    emoji: '💥',
    heading: 'Runtime Error',
    subtext: 'Your program crashed while running this test case.',
    tone: 'error',
    anim: 'animate-pulse',
  },
  pending: {
    icon: Clock,
    emoji: '⏳',
    heading: 'Pending',
    subtext: 'Still judging…',
    tone: 'neutral',
    anim: '',
  },
};

const TONE_CLASSES = {
  success: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success' },
  error: { bg: 'bg-error/10', border: 'border-error/30', text: 'text-error' },
  warning: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning' },
  neutral: { bg: 'bg-base-200', border: 'border-base-300', text: 'text-base-content/60' },
};

export default function SubmitResultPanel({ result, loading, error }) {
  if (loading)
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-72 text-base-content/50">
        <span className="loading loading-spinner loading-lg" />
        <p className="font-medium">Judging your submission…</p>
      </div>
    );

  if (error)
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-72 text-center px-6">
        <span className="text-5xl">⚠️</span>
        <p className="text-error font-semibold">{error}</p>
      </div>
    );

  if (!result)
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-72 text-center px-6 text-base-content/40">
        <span className="text-5xl">🧑‍💻</span>
        <p className="text-sm">Hit Submit to run your code against all test cases.</p>
      </div>
    );

  const meta = STATUS_META[result.status] ?? STATUS_META.pending;
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  const fc = result.failedCase;

  return (
    <div className="flex flex-col gap-6">
      {/* Verdict banner — icon and text sit side by side so long subtext
          (TLE / Wrong Answer / Runtime Error) doesn't stack the panel tall. */}
      <div
        className={`rounded-2xl border-2 ${tone.border} ${tone.bg} px-6 py-6 flex items-center gap-5`}
      >
        <Icon size={48} strokeWidth={1.75} className={`${tone.text} ${meta.anim} shrink-0`} />
        <div className="flex flex-col gap-1">
          <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${tone.text}`}>
            {meta.emoji} {meta.heading}
          </p>
          <p className="text-sm text-base-content/60">{meta.subtext}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats stats-vertical sm:stats-horizontal shadow-sm border border-base-200 w-full">
        <div className="stat">
          <div className="stat-title">Test Cases</div>
          <div className={`stat-value text-2xl ${tone.text}`}>
            {result.testCasesPassed}/{result.totalTestCases}
          </div>
        </div>
        {result.status === 'accepted' && result.runTime != null && (
          <div className="stat">
            <div className="stat-title flex items-center gap-1">
              <Clock size={13} /> Runtime
            </div>
            <div className="stat-value text-2xl">{(result.runTime * 1000).toFixed(0)} ms</div>
          </div>
        )}
        {result.status === 'accepted' && result.memory != null && (
          <div className="stat">
            <div className="stat-title flex items-center gap-1">
              <Cpu size={13} /> Memory
            </div>
            <div className="stat-value text-2xl">{result.memory} KB</div>
          </div>
        )}
      </div>

      {/* Failed case detail */}
      {fc?.input && (
        <div className="rounded-xl border border-base-200 p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold text-base-content/70">Failing test case</p>
          <div className="font-mono text-xs bg-base-200 rounded-lg p-4 flex flex-col gap-4">
            <div>
              <p className="text-base-content/50 font-sans mb-1.5">Input</p>
              <p className="whitespace-pre-wrap">{fc.input}</p>
            </div>
            <div>
              <p className="text-base-content/50 font-sans mb-1.5">Expected Output</p>
              <p className="whitespace-pre-wrap">{fc.expectedOutput}</p>
            </div>
            <div>
              <p className="text-base-content/50 font-sans mb-1.5">Your Output</p>
              <p className="whitespace-pre-wrap text-error">{fc.actualOutput ?? '—'}</p>
            </div>
          </div>
          {fc.errorMessage && (
            <div className="text-error whitespace-pre-wrap text-xs bg-error/5 border border-error/20 rounded-lg p-3">
              {fc.errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
