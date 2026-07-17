import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import frontendClient from '../utils/axiosInstance';
import ResendVerificationForm from '../components/ResendVerificationForm';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // verifying | success | error
  const [status, setStatus] = useState(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(token ? '' : 'Missing verification token.');

  useEffect(() => {
    if (!token) return;
    frontendClient
      .get(`/user/verify?token=${token}`)
      .then(({ data }) => {
        setStatus('success');
        setMessage(data.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.message ?? 'Verification failed.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="card bg-base-100 w-full max-w-md shadow-xl">
        <div className="card-body gap-4 items-center text-center">
          {status === 'verifying' && (
            <>
              <span className="loading loading-spinner loading-lg" />
              <p className="text-base-content/60">Verifying your email...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <h1 className="text-2xl font-bold text-success">Email verified</h1>
              <p className="text-base-content/60">{message}</p>
              <Link to="/login" className="btn btn-primary mt-2">
                Go to login
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="text-2xl font-bold text-error">Verification failed</h1>
              <p className="text-base-content/60">{message}</p>
              <div className="w-full text-left mt-2">
                <p className="text-sm text-base-content/50 mb-1">Request a new link:</p>
                <ResendVerificationForm />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
