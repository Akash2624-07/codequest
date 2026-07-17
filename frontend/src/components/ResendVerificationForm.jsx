import { useState } from 'react';
import frontendClient from '../utils/axiosInstance';

function ResendVerificationForm({ defaultEmail = '' }) {
  const [emailId, setEmailId] = useState(defaultEmail);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const { data } = await frontendClient.post('/user/resend-verification', { emailId });
      setMessage(data.message);
      setStatus('sent');
    } catch (err) {
      setMessage(err.response?.data?.message ?? 'Failed to resend verification email.');
      setStatus('error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {message && (
        <p className={`text-xs ${status === 'error' ? 'text-error' : 'text-success'}`}>{message}</p>
      )}
      <div className="flex gap-2">
        <input
          type="email"
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          placeholder="you@example.com"
          className="input input-bordered input-sm flex-1"
          required
        />
        <button type="submit" className="btn btn-sm btn-outline" disabled={status === 'sending'}>
          {status === 'sending' ? <span className="loading loading-spinner loading-xs" /> : 'Resend link'}
        </button>
      </div>
    </form>
  );
}

export default ResendVerificationForm;
