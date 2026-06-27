import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import frontendClient from '../utils/axiosInstance';
import DifficultyBadge from '../components/DifficultyBadge';
import FilterBar from '../components/FilterBar';

function Home() {
  const [problems, setProblems] = useState([]);
  // NOTE: solvedIds is fetched once on mount. It will be stale after the user
  // solves a problem until a full page reload. Acceptable for now; revisit if
  // we add in-app navigation back from the problem page.
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);

  const [difficulty, setDifficulty] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedTags, setSelectedTags] = useState(new Set());

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [problemRes, solvedRes] = await Promise.all([
          frontendClient.get('/problems?limit=50'),
          frontendClient.get('/problems/solved/me'),
        ]);
        setProblems(problemRes.data.problem);
        setNextCursor(problemRes.data.nextCursor);
        setHasMore(problemRes.data.hasMore);
        setSolvedIds(new Set(solvedRes.data.map((p) => p._id)));
      } catch {
        setError('Failed to load problems. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await frontendClient.get(`/problems?limit=50&cursor=${nextCursor}`);
      setProblems((prev) => [...prev, ...res.data.problem]);
      setNextCursor(res.data.nextCursor);
      setHasMore(res.data.hasMore);
    } catch {
      setLoadMoreError('Failed to load more problems. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const availableTags = useMemo(
    () => [...new Set(problems.flatMap((p) => p.tags))].sort(),
    [problems],
  );

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      if (difficulty !== 'all' && p.difficulty !== difficulty) return false;
      if (status === 'solved' && !solvedIds.has(p._id)) return false;
      if (status === 'unsolved' && solvedIds.has(p._id)) return false;
      if (selectedTags.size > 0 && !p.tags.some((t) => selectedTags.has(t))) return false;
      return true;
    });
  }, [problems, solvedIds, difficulty, status, selectedTags]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Problems</h1>
        <p className="text-base-content/50 text-sm mt-1">
          {filtered.length}{problems.length !== filtered.length ? ` of ${problems.length}` : ''} problem{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      <FilterBar
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        status={status}
        setStatus={setStatus}
        availableTags={availableTags}
        selectedTags={selectedTags}
        toggleTag={toggleTag}
      />

      <div className="overflow-x-auto rounded-xl border border-base-200 mt-6">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Title</th>
              <th>Tags</th>
              <th>Difficulty</th>
              <th className="w-16 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-base-content/40 py-16">
                  {hasMore
                    ? "No problems on the loaded pages match your filters. There are more problems that haven't been loaded yet — try “Load More” below to fetch them, then filter again."
                    : 'No problems match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((problem, index) => (
                <tr key={problem._id} className="hover">
                  <td className="text-base-content/40 text-sm">{index + 1}</td>
                  <td>
                    <Link
                      to={`/problems/${problem._id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {problem.title}
                    </Link>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {problem.tags.map((tag) => (
                        <span key={tag} className="badge badge-outline badge-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <DifficultyBadge difficulty={problem.difficulty} />
                  </td>
                  <td className="text-center">
                    {solvedIds.has(problem._id) && (
                      <CheckCircle2 size={18} className="text-success inline" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <span className="loading loading-spinner loading-sm" /> : 'Load More'}
          </button>
          {loadMoreError && (
            <p className="text-error text-sm mt-2">{loadMoreError}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
