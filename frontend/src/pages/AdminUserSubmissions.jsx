import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router';
import Editor from '@monaco-editor/react';
import { ArrowLeft, Eye } from 'lucide-react';
import frontendClient from '../utils/axiosInstance';
import { formatDateParts } from '../utils/formatDate';
import { LANGUAGE_LABELS } from '../schemas/problemSchema';
import DifficultyBadge from '../components/DifficultyBadge';

const STATUS_LABEL = {
  accepted: 'Accepted', wrong: 'Wrong Answer',
  tle: 'Time Limit Exceeded', error: 'Runtime Error', pending: 'Pending',
};
const STATUS_BADGE = {
  accepted: 'badge-success', wrong: 'badge-error',
  tle: 'badge-warning', error: 'badge-error', pending: 'badge-ghost',
};
const MONACO_LANG = { cpp: 'cpp', c: 'c', java: 'java', python: 'python', javascript: 'javascript' };

function AdminUserSubmissions() {
  const { id } = useParams();
  const location = useLocation();
  const linkedUser = location.state?.user;

  const [submissions, setSubmissions] = useState(null);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    frontendClient
      .get(`/problems/submissions/admin/${id}`)
      .then(({ data }) => setSubmissions(data))
      .catch(() => setError('Failed to load submissions.'));
  }, [id]);

  // Group by problem, preserving order of most-recently-submitted problem
  // first (submissions already arrive sorted newest-first).
  const groups = useMemo(() => {
    if (!submissions) return null;
    const map = new Map();
    for (const s of submissions) {
      const problem = s.problemId;
      const key = problem?._id ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, { problem, submissions: [] });
      }
      map.get(key).submissions.push(s);
    }
    return [...map.values()];
  }, [submissions]);

  const displayUser = submissions?.[0]?.userId ?? linkedUser;

  const openCode = (s) => {
    setViewing(s);
    dialogRef.current?.showModal();
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link to="/admin/users" className="btn btn-ghost btn-sm gap-1 mb-4">
        <ArrowLeft size={15} />
        Back to Users
      </Link>

      <h1 className="text-2xl font-bold mb-1">
        Submissions{displayUser ? ` — ${displayUser.firstName} ${displayUser.lastName ?? ''}` : ''}
      </h1>
      {displayUser?.emailId && (
        <p className="text-base-content/50 text-sm mb-6">{displayUser.emailId}</p>
      )}

      {error && <div className="alert alert-error text-sm mb-4">{error}</div>}

      {!submissions && !error && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {groups && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 min-h-[30vh] text-center text-base-content/40">
          <span className="text-4xl">📭</span>
          <p className="text-sm">This user hasn't submitted anything yet.</p>
        </div>
      )}

      {groups?.map(({ problem, submissions: subs }) => (
        <div key={problem?._id ?? 'unknown'} className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-semibold">{problem?.title ?? 'Unknown problem'}</h2>
            {problem?.difficulty && <DifficultyBadge difficulty={problem.difficulty} />}
            <span className="text-base-content/40 text-sm">
              {subs.length} submission{subs.length !== 1 ? 's' : ''}
            </span>
          </div>

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
                {subs.map((s) => {
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
        </div>
      ))}

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
    </div>
  );
}

export default AdminUserSubmissions;
