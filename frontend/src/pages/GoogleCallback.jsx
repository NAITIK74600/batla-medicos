import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

// Error messages for each google_error query param value set by the server-side callback
const ERROR_MESSAGES = {
  no_code:          'Google sign-in was cancelled.',
  google_cancelled: 'Google sign-in was cancelled.',
  unverified_email: 'Your Google account email is not verified.',
  banned:           'This account has been suspended.',
  failed:           'Google sign-in failed. Please try again.',
};

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // The server-side callback at GET /api/auth/google/callback handles the OAuth
    // exchange and redirects directly to the destination page. This component is
    // only reached when the server redirects here with a ?google_error= param.
    const errorKey = params.get('google_error');
    if (errorKey) {
      toast.error(ERROR_MESSAGES[errorKey] || 'Google sign-in failed. Please try again.');
      navigate('/login', { replace: true });
    } else {
      // No error and no code — user navigated here directly; send them home.
      navigate('/', { replace: true });
    }
  }, [params, navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <p style={{ fontSize: '1.1rem', color: '#666' }}>Signing in with Google…</p>
    </div>
  );
}
