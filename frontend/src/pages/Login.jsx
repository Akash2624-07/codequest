import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';

// ── Schema ────────────────────────────────────────────────────────────────────
// Defined outside the component so it isn't recreated on every render
import { loginSchema } from '../schemas/authSchemas';

// ── Component ─────────────────────────────────────────────────────────────────
function Login() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = (data) => {
    // TODO: replace with API call once Axios is set up
    console.log(data);
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="card bg-base-100 w-full max-w-md shadow-xl">
        <div className="card-body gap-4">
          {/* Header */}
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-base-content/60 text-sm mt-1">
              Dont have one?{' '}
              <Link to="/signup" className="link link-primary">
                Sign up
              </Link>
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {/* Email */}
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Email</legend>
              <input
                {...register('emailId')}
                type="email"
                placeholder="akash@example.com"
                className={`input input-bordered w-full ${errors.emailId ? 'input-error' : ''}`}
              />
              {errors.emailId && (
                <p className="fieldset-label text-error">
                  {errors.emailId.message}
                </p>
              )}
            </fieldset>

            {/* Password */}
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Password</legend>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                className={`input input-bordered w-full ${errors.password ? 'input-error' : ''}`}
              />
              {errors.password && (
                <p className="fieldset-label text-error">
                  {errors.password.message}
                </p>
              )}
            </fieldset>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full mt-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
