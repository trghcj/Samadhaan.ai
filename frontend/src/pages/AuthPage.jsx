import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  RecaptchaVerifier, 
  signInWithPhoneNumber 
} from 'firebase/auth';
import { Chrome } from 'lucide-react';

const AuthPage = () => {
  const [authMode, setAuthMode] = useState('email_login'); // email_login, email_signup, phone
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize reCAPTCHA for phone auth
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible'
      });
    }
  }, []);

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

  const handlePhoneSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmationResult.confirm(otp);
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

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button 
            className={`btn ${authMode.startsWith('email') ? 'btn-primary' : 'btn-outline'}`} 
            style={{ flex: 1 }} 
            onClick={() => setAuthMode('email_login')}
          >
            Email
          </button>
          <button 
            className={`btn ${authMode === 'phone' ? 'btn-primary' : 'btn-outline'}`} 
            style={{ flex: 1 }} 
            onClick={() => {
              setAuthMode('phone');
              setConfirmationResult(null);
            }}
          >
            Phone
          </button>
        </div>

        {authMode.startsWith('email') && (
          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
              {authMode === 'email_login' ? 'Sign In' : 'Sign Up'}
            </button>
            <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setAuthMode(authMode === 'email_login' ? 'email_signup' : 'email_login')}>
                {authMode === 'email_login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </span>
            </div>
          </form>
        )}

        {authMode === 'phone' && (
          <div>
            {!confirmationResult ? (
              <form onSubmit={handlePhoneSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Phone Number (with country code)</label>
                  <input type="tel" placeholder="+91 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Enter 6-digit Code</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
                  Verify & Sign In
                </button>
              </form>
            )}
            <div id="recaptcha-container"></div>
          </div>
        )}

        <div style={{ margin: '2rem 0', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
          <span style={{ padding: '0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
        </div>

        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn btn-outline" 
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Chrome size={18} /> Continue with Google
        </button>
        
      </div>
    </div>
  );
};

export default AuthPage;
