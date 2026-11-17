import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api';

// TEMPORARY (mentor demo): shows what the classifier saw. Remove this component and its
// two usages below once the review is over.
const ConfidenceDebug = ({ result }) => {
  const [open, setOpen] = useState(false); // hidden until the presenter asks for it
  if (!result || (result.raw_confidence === undefined && result.confidence_score === undefined)) return null;
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  const row = { display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.15rem 0' };
  if (!open) {
    return (
      <button type="button" className="btn btn-outline" style={{ marginTop: '1.5rem', padding: '0.35rem 1rem', fontSize: '0.85rem' }} onClick={() => setOpen(true)}>
        Show details
      </button>
    );
  }
  return (
    <div style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', border: '1px dashed #94A3B8', borderRadius: '8px', background: '#F8FAFC', fontSize: '0.85rem', textAlign: 'left', color: '#334155' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 700 }}>Confidence details (temporary, for review)</div>
        <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setOpen(false)}>Hide details</button>
      </div>
      {result.transcript && <div style={row}><span>Heard</span><span style={{ textAlign: 'right' }}>{result.transcript}</span></div>}
      <div style={row}><span>Classifier</span><span>{result.classifier || 'gemini'}</span></div>
      <div style={row}><span>Level</span><strong>{result.confidence_level}</strong></div>
      {result.raw_confidence !== undefined && <div style={row}><span>Model's top probability</span><strong>{pct(result.raw_confidence)}</strong></div>}
      {result.t_high !== undefined && (
        <div style={row}><span>Routed automatically at or above</span><span>{pct(result.t_high)}</span></div>
      )}
      {result.set_size !== undefined && <div style={row}><span>Departments still possible (conformal set)</span><span>{result.set_size}</span></div>}
      {Array.isArray(result.top3) && (
        <div style={{ marginTop: '0.5rem' }}>
          {result.top3.map((d, i) => (
            <div key={d.department} style={row}><span>{i + 1}. {d.department}</span><span>{pct(d.probability)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
};

// What the system understood (speech) or what the citizen typed. Always shown, so a wrong transcript is visible.
const TranscriptBox = ({ result }) => {
  const { t } = useTranslation();
  if (!result || !result.transcript) return null;
  const heard = result.transcript !== '[Inaudible / Empty Audio]';
  return (
    <div style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: '#F1F5F9', textAlign: 'left' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B', marginBottom: '0.35rem' }}>
        {result.input === 'text' ? t('What you wrote', { defaultValue: 'What you wrote' }) : t('What we heard', { defaultValue: 'What we heard' })}
      </div>
      <div dir="auto" style={{ fontSize: '1.05rem', color: '#0F172A', whiteSpace: 'pre-wrap' }}>
        {heard ? result.transcript : t('We could not hear any speech in the recording.', { defaultValue: 'We could not hear any speech in the recording.' })}
      </div>
    </div>
  );
};

const CitizenPortal = () => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, recording, form, processing, success, clarification
  const [result, setResult] = useState(null);
  const [statusStep, setStatusStep] = useState(null);
  
  // New Form Fields
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [location, setLocation] = useState('');
  const [extraDetails, setExtraDetails] = useState('');
  const DEFAULT_OPTIONS = ['Water', 'Electricity', 'Roads', 'Sanitation', 'Drainage', 'Street Lights']; // only for the Gemini fallback, which sends no options
  const [beforePhoto, setBeforePhoto] = useState(null);
  const [language, setLanguage] = useState('hi'); // the language the citizen will speak; sent to Whisper so it need not guess
  const [inputMode, setInputMode] = useState('voice'); // 'voice' or 'text'
  const [typedText, setTypedText] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const resetToStart = () => {
    setInputMode('voice');
    setTypedText('');
    setStatus('idle');
  };

  const startTyping = () => {
    if (!currentUser) {
      const wantToLogin = window.confirm("Log in to track your grievance status on a personalized dashboard!\n\nClick OK to log in, or Cancel to report anonymously.");
      if (wantToLogin) {
        navigate('/auth');
        return;
      }
    }
    setInputMode('text');
    setStatus('form');
  };

  const startRecording = async () => {
    setInputMode('voice');
    if (!currentUser) {
      const wantToLogin = window.confirm("Log in to track your grievance status on a personalized dashboard!\n\nClick OK to log in, or Cancel to report anonymously.");
      if (wantToLogin) {
        navigate('/auth');
        return;
      }
    }
    try {
      // Browser noise suppression / echo cancellation can smear speech and hurt Whisper; keep automatic gain
      // so a quiet laptop mic is boosted, and use a higher bitrate for the recording.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      mediaRecorderRef.current = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioData(blob);
        chunksRef.current = [];
        
        setStatus('form');
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required to report a grievance.");
    }
  };

  const submitGrievanceForm = async (e) => {
    e.preventDefault();
    setStatus('processing');
    
    const formData = new FormData();
    if (inputMode === 'text') {
      formData.append('text', typedText);
    } else {
      formData.append('file', audioData, 'recording.webm');
      formData.append('language', language);
    }
    
    if (currentUser) {
      formData.append('user_id', currentUser.uid);
    } else {
      formData.append('reporter_name', reporterName);
      formData.append('reporter_phone', reporterPhone);
    }
    formData.append('location', location);
    if (extraDetails) formData.append('extra_details', extraDetails);
    
    // Upload Before Photo to Cloudinary if selected
    if (beforePhoto) {
      setStatusStep('Uploading photo...');
      const imgData = new FormData();
      imgData.append("file", beforePhoto);
      imgData.append("upload_preset", "samadhaan_uploads");
      imgData.append("cloud_name", "gd6ovrz6");
      try {
        const res = await fetch("https://api.cloudinary.com/v1_1/gd6ovrz6/image/upload", {
          method: "POST",
          body: imgData,
        });
        const cloudData = await res.json();
        if (cloudData.secure_url) {
          formData.append('before_photo_url', cloudData.secure_url);
        }
      } catch (err) {
        console.error("Photo upload failed:", err);
      }
    }
    
    try {
      const response = await fetch(`${API_BASE}${inputMode === 'text' ? '/api/submit-text' : '/api/upload'}`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (!response.ok) {
        alert(data.detail || 'The server could not accept this complaint.');
        setStatus('form');
        return;
      }

      if (data.task_id) {
        // Start polling the status endpoint every 2 seconds
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/api/status/${data.task_id}`);
            const statusData = await statusRes.json();
            
            if (statusData.status === 'success') {
              clearInterval(pollInterval);
              setResult(statusData.ai_result);
              if (statusData.ai_result.confidence_level === 'Medium') {
                setStatus('clarification');
              } else {
                setStatus('success');
              }
            } else if (statusData.status === 'error') {
              clearInterval(pollInterval);
              console.error("Backend Task Error:", statusData.error);
              alert("An error occurred during AI processing: " + (statusData.error || "Unknown Error. Please try again."));
              setStatus(inputMode === 'text' ? 'form' : 'idle');
            } else if (statusData.status === 'processing') {
              // Update the UI with the specific step from the backend
              if (statusData.step) {
                setStatusStep(statusData.step);
              }
            }
          } catch (pollErr) {
            console.error("Polling error:", pollErr);
          }
        }, 2000);
      }
    } catch (err) {
      // Do not fake a result: a failed request must be visible, not shown as a routed complaint.
      console.error("Could not reach the backend:", err);
      alert(`Could not reach the server at ${API_BASE}. Is the backend running?`);
      setStatus(inputMode === 'text' ? 'form' : 'idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // The citizen picks one of the offered departments, or "none_of_these" (then a person reviews the complaint).
  const submitClarification = async (choice) => {
    setStatus('processing');
    setStatusStep('Saving your answer...');
    try {
      const res = await fetch(`${API_BASE}/api/grievances/${result.id}/clarify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult({ ...result, prediction_set: data.prediction || result.prediction_set, confidence_level: data.outcome === 'human_review' ? 'Low' : 'Confirmed by citizen' });
      setStatus('success');
    } catch (e) {
      console.error(e);
      alert("Failed to submit your answer. Please try again.");
      setStatus('clarification');
    }
  };

  return (
    <div>
      {/* Dark Hero Section like TestFit */}
      <div className="section-dark">
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>
          {t("Communicate with your city, starting from an AI-generated grievance plan.")}
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto 2rem auto' }}>
          {t("Report a municipal issue simply by using your voice. Speak naturally in your native language and let Samadhaan.ai route it instantly.")}
        </p>
      </div>

      <div style={{ maxWidth: '600px', margin: '-4rem auto 2rem auto', position: 'relative', zIndex: 10 }}>
        <div className="card" style={{ padding: '3.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
        
        {status === 'idle' || status === 'recording' ? (
          <>
            <button 
              className={`btn ${isRecording ? 'animate-recording' : 'btn-primary'}`} 
              onClick={isRecording ? stopRecording : startRecording}
              style={{ width: '140px', height: '140px', borderRadius: '50%', padding: 0 }}
            >
              {isRecording ? <Square size={48} /> : <Mic size={48} />}
            </button>
            <p style={{ fontWeight: 500, fontSize: '1.25rem' }}>
              {isRecording ? "Recording... Tap to stop" : "Tap to start recording"}
            </p>
            {!isRecording && (
              <>
                <div role="group" aria-label="Language of your complaint" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('I will speak in', { defaultValue: 'I will speak in' })}</span>
                  {[['hi', 'हिन्दी'], ['en', 'English']].map(([code, label]) => (
                    <button key={code} type="button" className={`btn ${language === code ? 'btn-primary' : 'btn-outline'}`}
                      aria-pressed={language === code} style={{ padding: '0.4rem 1.1rem' }} onClick={() => setLanguage(code)}>{label}</button>
                  ))}
                </div>
                <button type="button" className="btn btn-outline" onClick={startTyping}>{t('Or type your complaint instead', { defaultValue: 'Or type your complaint instead' })}</button>
              </>
            )}
          </>
        ) : status === 'form' ? (
          <form onSubmit={submitGrievanceForm} style={{ width: '100%', textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700 }}>Just a few more details...</h2>

            {inputMode === 'text' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t('Your complaint *', { defaultValue: 'Your complaint *' })}</label>
                <textarea value={typedText} onChange={e => setTypedText(e.target.value)} required rows="4" maxLength={1000} dir="auto"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                  placeholder="e.g. meri gali mein paani nahi aa raha hai / no water in my street" />
              </div>
            )}
            
            {!currentUser && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t("Full Name *")}</label>
                  <input type="text" value={reporterName} onChange={e => setReporterName(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. Ramesh Kumar" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t("Phone Number *")}</label>
                  <input type="tel" value={reporterPhone} onChange={e => setReporterPhone(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. +91 98765 43210" />
                </div>
              </>
            )}
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t("Location / Village *")}</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. Near main square, Palampur" />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t("Extra Details (Optional)")}</label>
              <textarea value={extraDetails} onChange={e => setExtraDetails(e.target.value)} rows="3" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="Any other context we should know?" />
            </div>
            
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>{t('"Before" Photo (Optional)')}</label>
              <input type="file" accept="image/*" onChange={(e) => setBeforePhoto(e.target.files[0])} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '1rem' }} onClick={resetToStart}>{t("Cancel")}</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '1rem' }}>{t("Submit Grievance")}</button>
            </div>
          </form>
        ) : status === 'processing' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            {/* simple inline spinner style */}
            <div style={{ border: '4px solid #E2E8F0', borderTop: '4px solid var(--color-primary)', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ fontSize: '1.125rem', fontWeight: 500 }}>{statusStep || t("Analyzing grievance...")}</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : status === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <CheckCircle size={72} style={{ marginBottom: '1.5rem', color: '#10B981' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>{t("Grievance Routed")}</h2>
            {result?.confidence_level === 'Low' ? (
              <p style={{ color: 'var(--text-muted)' }}>{t("We were unable to confidently categorize your issue automatically. It has been sent directly to a Human Operator for manual review.")}</p>
            ) : result?.prediction_set === 'Unclear' && result?.confidence_level === 'High' ? (
              // The model is sure this is none of our departments: not the same as being unsure.
              <p style={{ color: 'var(--text-muted)' }}>{t("This doesn't look like a problem for one of our departments (water, electricity, roads, sanitation, drainage, street lights). It has been sent to an operator, who will guide you.", { defaultValue: "This doesn't look like a problem for one of our departments (water, electricity, roads, sanitation, drainage, street lights). It has been sent to an operator, who will guide you." })}</p>
            ) : result?.prediction_set === 'Unclear' ? (
              <p style={{ color: 'var(--text-muted)' }}>{t("We were unable to confidently categorize your issue automatically. It has been sent directly to a Human Operator for manual review.")}</p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>
                {t("Your issue has been automatically sent to the")}{' '}
                <strong>{result?.prediction_set ? t(`${result.prediction_set} Dept.`, { defaultValue: `${result.prediction_set} Department` }) : 'relevant department'}</strong>.
              </p>
            )}
            <TranscriptBox result={result} />
            <ConfidenceDebug result={result} />
            <button className="btn btn-outline" style={{ marginTop: '2rem' }} onClick={resetToStart}>{t("Report Another")}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AlertTriangle size={72} style={{ marginBottom: '1.5rem', color: '#F59E0B' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem', textAlign: 'center' }}>
              {result?.prediction_set === 'Error' ? 'Analysis Failed' : 'We Need More Info'}
            </h2>
            {result?.prediction_set === 'Error' ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                {t("The AI encountered an error:")} <br/><strong style={{color: '#EF4444'}}>{result?.error || 'Unknown classification error'}</strong>
              </p>
            ) : (
              <div style={{ width: '100%' }}>
                <div style={{ padding: '1rem', backgroundColor: '#FEF3C7', borderRadius: 'var(--radius-sm)', color: '#92400E', marginBottom: '1.5rem' }}>
                  <strong>{t("Question from AI:")}</strong><br/>
                  {result?.clarifying_question || "We detected multiple possible departments. Could you provide a bit more detail to help us route this correctly?"}
                </div>
                <TranscriptBox result={result} />
            <ConfidenceDebug result={result} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  {(result?.options?.length ? result.options : DEFAULT_OPTIONS).map(dept => (
                    <button key={dept} className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={() => submitClarification(dept)}>
                      {t(`${dept} Dept.`, { defaultValue: `${dept} Department` })}
                    </button>
                  ))}
                  <button className="btn btn-outline" style={{ width: '100%', padding: '1rem' }} onClick={() => submitClarification('none_of_these')}>
                    {t("None of these", { defaultValue: 'None of these' })}
                  </button>
                </div>
                <button className="btn btn-outline" style={{ width: '100%' }} onClick={resetToStart}>{t("Start Over")}</button>
              </div>
            )}
          </div>
        )}
        
      </div>
    </div>
  </div>
  );
};

export default CitizenPortal;
