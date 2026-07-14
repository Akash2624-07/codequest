import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, Shield, Trash2, UserPlus } from 'lucide-react';
import frontendClient from '../utils/axiosInstance';
import { formatDateParts } from '../utils/formatDate';
import { signupSchema } from '../schemas/authSchemas';

function AdminUsers() {
  const { user: currentUser } = useSelector((state) => state.auth);

  const [users, setUsers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Tracks the id of whichever row has a role/delete request in flight,
  // so only that row's buttons disable instead of the whole table.
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [createError, setCreateError] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) });

  useEffect(() => {
    frontendClient
      .get('/user/admin/users?limit=20')
      .then(({ data }) => {
        setUsers(data.users);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await frontendClient.get(`/user/admin/users?limit=20&cursor=${nextCursor}`);
      setUsers((prev) => [...prev, ...data.users]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      setError('Failed to load more users.');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleRole = async (targetUser) => {
    const nextRole = targetUser.role === 'admin' ? 'user' : 'admin';
    setBusyId(targetUser._id);
    setRowError(null);
    try {
      const { data } = await frontendClient.patch(
        `/user/admin/users/${targetUser._id}/role`,
        { role: nextRole },
      );
      setUsers((prev) =>
        prev.map((u) => (u._id === targetUser._id ? data.user : u)),
      );
    } catch (err) {
      setRowError(err.response?.data?.message ?? 'Failed to update role.');
    } finally {
      setBusyId(null);
    }
  };

  const onCreateAdmin = async (data) => {
    setCreateError(null);
    try {
      const { data: res } = await frontendClient.post('/user/admin/register', data);
      setUsers((prev) => [res.user, ...prev]);
      reset();
      setShowCreateAdmin(false);
    } catch (err) {
      setCreateError(err.response?.data?.message ?? 'Failed to create admin.');
    }
  };

  const deleteUser = async (targetUser) => {
    if (!window.confirm(`Delete ${targetUser.firstName}'s account? This cannot be undone.`)) return;
    setBusyId(targetUser._id);
    setRowError(null);
    try {
      await frontendClient.delete(`/user/admin/users/${targetUser._id}`);
      setUsers((prev) => prev.filter((u) => u._id !== targetUser._id));
    } catch (err) {
      setRowError(err.response?.data?.message ?? 'Failed to delete user.');
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Users</h1>
        <button
          className="btn btn-primary btn-sm gap-2"
          onClick={() => setShowCreateAdmin((v) => !v)}
        >
          <UserPlus size={15} />
          Add Admin
        </button>
      </div>

      {showCreateAdmin && (
        <form
          onSubmit={handleSubmit(onCreateAdmin)}
          className="card bg-base-200 mb-6 p-4 flex flex-col gap-3"
          noValidate
        >
          {createError && (
            <div className="alert alert-error text-sm py-2">{createError}</div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <fieldset className="fieldset flex-1">
              <legend className="fieldset-legend">First Name</legend>
              <input
                {...register('firstName')}
                type="text"
                className={`input input-bordered w-full ${errors.firstName ? 'input-error' : ''}`}
              />
              {errors.firstName && (
                <p className="fieldset-label text-error">{errors.firstName.message}</p>
              )}
            </fieldset>
            <fieldset className="fieldset flex-1">
              <legend className="fieldset-legend">Email</legend>
              <input
                {...register('emailId')}
                type="email"
                className={`input input-bordered w-full ${errors.emailId ? 'input-error' : ''}`}
              />
              {errors.emailId && (
                <p className="fieldset-label text-error">{errors.emailId.message}</p>
              )}
            </fieldset>
            <fieldset className="fieldset flex-1">
              <legend className="fieldset-legend">Password</legend>
              <input
                {...register('password')}
                type="password"
                className={`input input-bordered w-full ${errors.password ? 'input-error' : ''}`}
              />
              {errors.password && (
                <p className="fieldset-label text-error">{errors.password.message}</p>
              )}
            </fieldset>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowCreateAdmin(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? <span className="loading loading-spinner loading-xs" /> : 'Create Admin'}
            </button>
          </div>
        </form>
      )}

      {rowError && (
        <div className="alert alert-error mb-4 text-sm">{rowError}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-base-200">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u._id === currentUser?._id;
              const isBusy = busyId === u._id;
              return (
                <tr key={u._id} className="hover">
                  <td className="font-medium">
                    {u.firstName} {u.lastName ?? ''}
                    {isSelf && <span className="text-base-content/40 text-xs ml-1">(you)</span>}
                  </td>
                  <td className="text-base-content/70">{u.emailId}</td>
                  <td>
                    <span className={`badge badge-sm ${u.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-base-content/50 text-sm">{formatDateParts(u.createdAt).date}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn btn-ghost btn-xs"
                        title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                        disabled={isSelf || isBusy}
                        onClick={() => toggleRole(u)}
                      >
                        {u.role === 'admin' ? <Shield size={14} /> : <ShieldCheck size={14} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        title="Delete user"
                        disabled={isSelf || isBusy}
                        onClick={() => deleteUser(u)}
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

export default AdminUsers;
