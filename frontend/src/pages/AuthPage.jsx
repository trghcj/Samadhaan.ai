import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup 
} from 'firebase/auth';
import { LogIn } from 'lucide-react';

const AuthPage = () => {
  const [authMode, setAuthMode] = useState('email_login'); // email_login, email_signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (authMode === 'email_signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/operator');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/operator');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', textAlign: 'center' }}>
          Operator Portal
        </h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2rem' }}>
          Sign in to manage municipal grievances
        </p>

        {error && <div style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1.5rem', padding: '0.875rem' }}>
            {authMode === 'email_login' ? 'Sign In' : 'Sign Up'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.95rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setAuthMode(authMode === 'email_login' ? 'email_signup' : 'email_login')}>
              {authMode === 'email_login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </span>
          </div>
        </form>

        <div style={{ margin: '2.5rem 0', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
          <span style={{ padding: '0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
        </div>

        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn btn-outline" 
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontWeight: 600, padding: '0.875rem', marginTop: '0.5rem' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg> Continue with Google
        </button>
        
      </div>
    </div>
  );
};

export default AuthPage;
