import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import { registerUser } from '../store/authSlice';
import { signupSchema } from '../schemas/authSchemas';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// ── Schema ────────────────────────────────────────────────────────────────────
// Defined outside the component so it isn't recreated on every render

// ── Component ─────────────────────────────────────────────────────────────────
function Signup() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, loading, error } = useSelector(
    (state) => state.auth,
  );

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (data) => {
    await dispatch(registerUser(data));
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center px-4">
      <div className="card bg-base-100 w-full max-w-md shadow-xl">
        <div className="card-body gap-4">
          {/* Header */}
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold">Create an account</h1>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {/* First Name */}
            <fieldset className="fieldset">
              <legend className="fieldset-legend">First Name</legend>
              <input
                {...register('firstName')}
                type="text"
                placeholder="Akash"
                className={`input input-bordered w-full ${errors.firstName ? 'input-error' : ''}`}
              />
              {errors.firstName && (
                <p className="fieldset-label text-error">
                  {errors.firstName.message}
                </p>
              )}
            </fieldset>

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
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  className={`input input-bordered w-full pr-10 ${errors.password ? 'input-error' : ''}`}
                />

                <button
                  type="button"
                  className="absolute top-1/2 right-3 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <Eye /> : <EyeOff />}
                </button>
              </div>
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
                'Sign Up'
              )}
            </button>
            <div className="text-center mb-2">
              <p className="text-base-content/60 text-sm mt-1">
                Already have one?{' '}
                <Link to="/login" className="link link-primary">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Signup;
