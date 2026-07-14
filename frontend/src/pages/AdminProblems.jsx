import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Pencil, Trash2 } from 'lucide-react';
import frontendClient from '../utils/axiosInstance';
import DifficultyBadge from '../components/DifficultyBadge';

function AdminProblems() {
  const [problems, setProblems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null);

  useEffect(() => {
    frontendClient
      .get('/problems?limit=50')
      .then(({ data }) => {
        setProblems(data.problem);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      })
      .catch(() => setError('Failed to load problems.'))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await frontendClient.get(`/problems?limit=50&cursor=${nextCursor}`);
      setProblems((prev) => [...prev, ...data.problem]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      setError('Failed to load more problems.');
    } finally {
      setLoadingMore(false);
    }
  };

  const deleteProblem = async (problem) => {
    if (!window.confirm(`Delete "${problem.title}"? This cannot be undone.`)) return;
    setBusyId(problem._id);
    setRowError(null);
    try {
      await frontendClient.delete(`/problems/${problem._id}`);
      setProblems((prev) => prev.filter((p) => p._id !== problem._id));
    } catch (err) {
      const d = err.response?.data;
      setRowError((typeof d === 'string' ? d : d?.message) ?? 'Failed to delete problem.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Problems</h1>

      {rowError && (
        <div className="alert alert-error mb-4 text-sm">{rowError}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-base-200">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Title</th>
              <th>Tags</th>
              <th>Difficulty</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => {
              const isBusy = busyId === p._id;
              return (
                <tr key={p._id} className="hover">
                  <td className="font-medium">{p.title}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {p.tags.map((tag) => (
                        <span key={tag} className="badge badge-outline badge-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <DifficultyBadge difficulty={p.difficulty} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Link
                        to={`/admin/problems/${p._id}/edit`}
                        className="btn btn-ghost btn-xs"
                        title="Edit problem"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        title="Delete problem"
                        disabled={isBusy}
                        onClick={() => deleteProblem(p)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <span className="loading loading-spinner loading-sm" /> : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminProblems;
