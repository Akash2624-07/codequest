import { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Eye } from 'lucide-react';
import frontendClient from '../../utils/axiosInstance';
import { formatDateParts } from '../../utils/formatDate';
import { LANGUAGE_LABELS } from '../../schemas/problemSchema';

const STATUS_LABEL = {
  accepted: 'Accepted', wrong: 'Wrong Answer',
  tle: 'Time Limit Exceeded', error: 'Runtime Error', pending: 'Pending',
};
const STATUS_BADGE = {
  accepted: 'badge-success', wrong: 'badge-error',
  tle: 'badge-warning', error: 'badge-error', pending: 'badge-ghost',
};
const MONACO_LANG = { cpp: 'cpp', c: 'c', java: 'java', python: 'python', javascript: 'javascript' };

export default function SubmissionsPanel({ problemId, newSubmission }) {
  const [submissions, setSubmissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    let active = true;
    frontendClient
      .get(`/problems/${problemId}/submissions`)
      .then(({ data }) => { if (active) setSubmissions(data); })
      .catch(() => { if (active) setSubmissions([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [problemId]);

  // Merge without calling setState inside effect body (avoids cascading renders)
  const displayed = useMemo(() => {
    if (!submissions) return null;
    if (!newSubmission) return submissions;
    const exists = submissions.some((s) => s._id === newSubmission._id);
    return exists ? submissions : [newSubmission, ...submissions];
  }, [submissions, newSubmission]);

  const openCode = (s) => {
    setViewing(s);
    dialogRef.current?.showModal();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-40">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );

  if (!displayed?.length)
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-40 text-center text-base-content/40">
        <span className="text-4xl">📭</span>
        <p className="text-sm">No submissions yet — hit Submit to make your first one.</p>
      </div>
    );

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-base-200">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Language</th>
              <th>Passed</th>
              <th>Runtime</th>
              <th>Memory</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((s) => {
              const { date, time } = formatDateParts(s.createdAt);
              return (
                <tr key={s._id} className="hover">
                  <td>
                    <span className={`badge ${STATUS_BADGE[s.status]} badge-sm font-medium whitespace-nowrap`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="text-sm">{LANGUAGE_LABELS[s.language] ?? s.language}</td>
                  <td className="text-sm text-base-content/70">
                    {s.testCasesPassed}/{s.totalTestCases}
                  </td>
                  <td className="text-sm text-base-content/70">
                    {s.status === 'accepted' && s.runTime != null ? `${(s.runTime * 1000).toFixed(0)} ms` : '—'}
                  </td>
                  <td className="text-sm text-base-content/70">
                    {s.status === 'accepted' && s.memory != null ? `${s.memory} KB` : '—'}
                  </td>
                  <td className="text-xs text-base-content/40 whitespace-nowrap">
                    <div className="flex flex-col leading-tight">
                      <span>{date}</span>
                      <span className="text-base-content/30">{time}</span>
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-xs gap-1" onClick={() => openCode(s)}>
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Code viewer modal */}
      <dialog ref={dialogRef} className="modal">
        <div className="modal-box max-w-3xl w-11/12 p-0 overflow-hidden">
          {viewing && (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-base-200">
                <div className="flex items-center gap-3">
                  <span className={`badge ${STATUS_BADGE[viewing.status]} badge-sm`}>
                    {STATUS_LABEL[viewing.status]}
                  </span>
                  <span className="text-sm text-base-content/60">
                    {LANGUAGE_LABELS[viewing.language] ?? viewing.language}
                  </span>
                  <div className="flex flex-col leading-tight text-xs text-base-content/40">
                    <span>{formatDateParts(viewing.createdAt).date}</span>
                    <span className="text-base-content/30">{formatDateParts(viewing.createdAt).time}</span>
                  </div>
                </div>
                <form method="dialog">
                  <button className="btn btn-ghost btn-xs">✕</button>
                </form>
              </div>
              <Editor
                height="420px"
                language={MONACO_LANG[viewing.language] ?? 'plaintext'}
                value={viewing.code}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                }}
              />
            </>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
