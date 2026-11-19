import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, CheckCircle, AlertTriangle, Play, Pause, RotateCcw, ImagePlus, X, MapPin, FileText, UserCheck, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api';
import { deptInfo, formatRef } from '../utils/grievance';
import LocationPicker from '../components/LocationPicker';

const formatDuration = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const DeptIcon = ({ prediction, size = 20 }) => {
  const d = deptInfo(prediction);
  return (
    <span className="dept-icon" style={{ background: d.bg, color: d.color, width: size + 22, height: size + 22, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <d.Icon size={size} />
    </span>
  );
};

// TEMPORARY (mentor demo): shows what the classifier saw. Remove this component and its
// two usages below once the review is over.
const ConfidenceDebug = ({ result }) => {
  const [open, setOpen] = useState(false); // hidden until the presenter asks for it
  if (!result || (result.raw_confidence === undefined && result.confidence_score === undefined)) return null;
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  const row = { display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.15rem 0' };
  if (!open) {
    return (
      <button type="button" className="link-btn muted" style={{ marginTop: '1.25rem', fontSize: '0.8rem' }} onClick={() => setOpen(true)}>
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
  // Map pin and address lines (all optional except the area / village in `location`)
  const [pin, setPin] = useState(null); // {lat, lng}
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [near, setNear] = useState(null);
  const autoFilled = useRef({ area: null, pincode: null }); // what the map filled in, so typed values are never overwritten
  const DEFAULT_OPTIONS = ['Water', 'Electricity', 'Roads', 'Sanitation', 'Drainage', 'Street Lights']; // only for the Gemini fallback, which sends no options
  const [beforePhoto, setBeforePhoto] = useState(null);
  const [language, setLanguage] = useState('hi'); // the language the citizen will speak; sent to Whisper so it need not guess
  const [inputMode, setInputMode] = useState('voice'); // 'voice' or 'text'
  const [typedText, setTypedText] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const audioElRef = useRef(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Object URLs for playing back the recording and previewing the photo; revoked when replaced.
  const audioUrl = useMemo(() => (audioData ? URL.createObjectURL(audioData) : null), [audioData]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const photoUrl = useMemo(() => (beforePhoto ? URL.createObjectURL(beforePhoto) : null), [beforePhoto]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const togglePlayback = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setIsPlaying(true); } else { el.pause(); setIsPlaying(false); }
  };

  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Fill Area and PIN from the map only when empty or still holding the previous auto-filled value.
  const applyAddress = (addr) => {
    setNear(addr?.display || null);
    if (!addr) return;
    if (addr.area) {
      setLocation(cur => (!cur.trim() || cur === autoFilled.current.area ? addr.area : cur));
      autoFilled.current.area = addr.area;
    }
    if (addr.pincode) {
      setPincode(cur => (!cur.trim() || cur === autoFilled.current.pincode ? addr.pincode : cur));
      autoFilled.current.pincode = addr.pincode;
    }
  };

  const resetToStart = () => {
    setInputMode('voice');
    setTypedText('');
    setBeforePhoto(null);
    setPin(null);
    setAddressLine('');
    setLandmark('');
    setPincode('');
    setNear(null);
    autoFilled.current = { area: null, pincode: null };
    setIsPlaying(false);
    setStatus('idle');
  };

  const startTyping = () => {
    if (!currentUser) {
      const wantToLogin = window.confirm(t("Log in to track your grievance status on a personalized dashboard!\n\nClick OK to log in, or Cancel to report anonymously."));
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
      const wantToLogin = window.confirm(t("Log in to track your grievance status on a personalized dashboard!\n\nClick OK to log in, or Cancel to report anonymously."));
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
        setRecordSeconds((Date.now() - recordStartRef.current) / 1000);
        setIsPlaying(false);
        chunksRef.current = [];
        
        setStatus('form');
      };

      mediaRecorderRef.current.start();
      recordStartRef.current = Date.now();
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert(t("Microphone access is required to report a grievance."));
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
    if (pin) {
      formData.append('latitude', pin.lat.toFixed(6));
      formData.append('longitude', pin.lng.toFixed(6));
    }
    if (addressLine.trim()) formData.append('address_line', addressLine.trim());
    if (landmark.trim()) formData.append('landmark', landmark.trim());
    if (pincode.trim()) formData.append('pincode', pincode.trim());
    
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
              alert(t("An error occurred during AI processing:") + " " + (statusData.error || t("Unknown Error. Please try again.")));
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
      alert(t("Could not reach the server at {{url}}. Is the backend running?", { url: API_BASE }));
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
      alert(t("Failed to submit your answer. Please try again."));
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
              {isRecording ? t("Recording... Tap to stop") : t("Tap to start recording")}
            </p>
            {!isRecording && (
              <>
                <div role="group" aria-label={t("Language of your complaint")} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.35rem', textAlign: 'center', fontWeight: 700 }}>{t('Where is the problem?', { defaultValue: 'Where is the problem?' })}</h2>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
              {t('A location helps the department reach the spot quickly.', { defaultValue: 'A location helps the department reach the spot quickly.' })}
            </p>

            {inputMode === 'voice' && audioUrl && (
              <div className="voice-ready">
                <button type="button" className="icon-btn" onClick={togglePlayback} aria-label={isPlaying ? 'Pause recording' : 'Play recording'}>
                  {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{t('Voice recording ready', { defaultValue: 'Voice recording ready' })}</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{formatDuration(recordSeconds)} · {language === 'hi' ? 'हिन्दी' : 'English'}</div>
                </div>
                <button type="button" className="link-btn" style={{ color: '#065F46' }} onClick={() => { setAudioData(null); setIsPlaying(false); setStatus('idle'); }}>
                  <RotateCcw size={14} /> {t('Re-record', { defaultValue: 'Re-record' })}
                </button>
                <audio ref={audioElRef} src={audioUrl} onEnded={() => setIsPlaying(false)} preload="metadata" hidden />
              </div>
            )}

            {inputMode === 'text' && (
              <div className="field">
                <label className="field-label"><FileText size={14} /> {t('Your complaint *', { defaultValue: 'Your complaint *' })}</label>
                <textarea className="input" value={typedText} onChange={e => setTypedText(e.target.value)} required rows="4" maxLength={1000} dir="auto"
                  placeholder={t("e.g. meri gali mein paani nahi aa raha hai / no water in my street")} />
              </div>
            )}

            {!currentUser && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1rem' }}>
                <div className="field">
                  <label className="field-label">{t("Full Name *")}</label>
                  <input className="input" type="text" value={reporterName} onChange={e => setReporterName(e.target.value)} required placeholder={t("E.g. Ramesh Kumar")} />
                </div>
                <div className="field">
                  <label className="field-label">{t("Phone Number *")}</label>
                  <input className="input" type="tel" value={reporterPhone} onChange={e => setReporterPhone(e.target.value)} required placeholder={t("E.g. +91 98765 43210")} />
                </div>
              </div>
            )}

            <div className="field">
              <label className="field-label"><MapPin size={14} /> {t('Mark the spot', { defaultValue: 'Mark the spot' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
              <LocationPicker value={pin} onChange={setPin} onAddress={applyAddress} />
              {pin && near && (
                <div className="near-line"><MapPin size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} /> <span><strong>{t('Near', { defaultValue: 'Near' })}:</strong> {near}</span></div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1rem' }}>
              <div className="field">
                <label className="field-label">{t('House / street', { defaultValue: 'House / street' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
                <input className="input" type="text" value={addressLine} onChange={e => setAddressLine(e.target.value)} maxLength={200} placeholder={t('E.g. H.No 12, Gali 4', { defaultValue: 'E.g. H.No 12, Gali 4' })} />
              </div>
              <div className="field">
                <label className="field-label">{t('Landmark', { defaultValue: 'Landmark' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
                <input className="input" type="text" value={landmark} onChange={e => setLandmark(e.target.value)} maxLength={200} placeholder={t('E.g. opposite the temple', { defaultValue: 'E.g. opposite the temple' })} />
              </div>
              <div className="field">
                <label className="field-label">{t("Location / Village *")}</label>
                <input className="input" type="text" value={location} onChange={e => setLocation(e.target.value)} required placeholder={t("E.g. Near main square, Palampur")} />
              </div>
              <div className="field">
                <label className="field-label">{t('PIN code', { defaultValue: 'PIN code' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
                <input className="input" type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                  title={t('6-digit PIN code', { defaultValue: '6-digit PIN code' })} placeholder="110085" />
              </div>
            </div>

            <div className="field">
              <label className="field-label">{t('Extra details', { defaultValue: 'Extra details' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
              <textarea className="input" value={extraDetails} onChange={e => setExtraDetails(e.target.value)} rows="2" placeholder={t('Landmark, since when, how many houses affected…', { defaultValue: 'Landmark, since when, how many houses affected…' })} />
            </div>

            <div className="field" style={{ marginBottom: '1.75rem' }}>
              <label className="field-label">{t('Photo of the problem', { defaultValue: 'Photo of the problem' })} <span className="optional">· {t('optional', { defaultValue: 'optional' })}</span></label>
              {photoUrl ? (
                <div className="photo-preview">
                  <img src={photoUrl} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{beforePhoto.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{(beforePhoto.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button type="button" className="icon-btn" style={{ color: '#6B7280' }} onClick={() => setBeforePhoto(null)} aria-label={t("Remove photo")}><X size={16} /></button>
                </div>
              ) : (
                <label className="photo-drop">
                  <span className="photo-icon"><ImagePlus size={20} /></span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 600, color: '#111827' }}>{t('Add a photo', { defaultValue: 'Add a photo' })}</span>
                    <span style={{ fontSize: '0.82rem' }}>{t('It helps the officer find and verify the issue', { defaultValue: 'It helps the officer find and verify the issue' })}</span>
                  </span>
                  <input type="file" accept="image/*" hidden onChange={(e) => setBeforePhoto(e.target.files[0] || null)} />
                </label>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '0.9rem', borderRadius: 10 }} onClick={resetToStart}>{t("Cancel")}</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '0.9rem', borderRadius: 10 }}>{t("Submit Grievance")}</button>
            </div>
          </form>
        ) : status === 'processing' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            {/* simple inline spinner style */}
            <div style={{ border: '4px solid #E2E8F0', borderTop: '4px solid var(--color-primary)', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ fontSize: '1.125rem', fontWeight: 500 }}>{statusStep ? t(statusStep) : t("Analyzing grievance...")}</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : status === 'success' ? (() => {
          const toOfficer = result?.confidence_level === 'Low' || result?.prediction_set === 'Unclear';
          const accent = toOfficer ? '#D97706' : '#10B981';
          return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: toOfficer ? '#FEF3C7' : '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
              {toOfficer ? <UserCheck size={38} color={accent} /> : <CheckCircle size={40} color={accent} />}
            </div>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              {toOfficer ? t('Sent to an officer', { defaultValue: 'Sent to an officer' }) : t('Complaint registered', { defaultValue: 'Complaint registered' })}
            </h2>
            {result?.confidence_level === 'Low' ? (
              <p style={{ color: 'var(--text-muted)' }}>{t("We were unable to confidently categorize your issue automatically. It has been sent directly to a Human Operator for manual review.")}</p>
            ) : result?.prediction_set === 'Unclear' && result?.confidence_level === 'High' ? (
              // The model is sure this is none of our departments: not the same as being unsure.
              <p style={{ color: 'var(--text-muted)' }}>{t("We couldn't match this to one of our departments (water, electricity, roads, sanitation, drainage, street lights). It has been sent to an operator, who will review it and guide you.", { defaultValue: "We couldn't match this to one of our departments (water, electricity, roads, sanitation, drainage, street lights). It has been sent to an operator, who will review it and guide you." })}</p>
            ) : result?.prediction_set === 'Unclear' ? (
              <p style={{ color: 'var(--text-muted)' }}>{t("We were unable to confidently categorize your issue automatically. It has been sent directly to a Human Operator for manual review.")}</p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>
                {t("Your issue has been automatically sent to the")}{' '}
                <strong>{result?.prediction_set ? t(`${result.prediction_set} Dept.`, { defaultValue: `${result.prediction_set} Department` }) : 'relevant department'}</strong>.
              </p>
            )}
            <div className="summary">
              {result?.id !== undefined && (
                <div className="summary-row">
                  <span className="k">{t('Reference number', { defaultValue: 'Reference number' })}</span>
                  <span className="v" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '1.05rem' }}>{formatRef(result.id)}</span>
                </div>
              )}
              <div className="summary-row">
                <span className="k">{t('Handled by', { defaultValue: 'Handled by' })}</span>
                <span className="v">
                  {toOfficer ? (
                    <><UserCheck size={16} color={accent} /> {t('Officer review', { defaultValue: 'Officer review' })}</>
                  ) : (
                    <><DeptIcon prediction={result?.prediction_set} size={14} /> {t(`${result?.prediction_set} Dept.`, { defaultValue: `${result?.prediction_set} Department` })}</>
                  )}
                </span>
              </div>
              {result?.confidence_level === 'Confirmed by citizen' && (
                <div className="summary-row">
                  <span className="k">{t('Department chosen by', { defaultValue: 'Department chosen by' })}</span>
                  <span className="v">{t('You', { defaultValue: 'You' })}</span>
                </div>
              )}
              {location && (
                <div className="summary-row">
                  <span className="k">{t('Location', { defaultValue: 'Location' })}</span>
                  <span className="v"><MapPin size={14} color="#6B7280" /> {[addressLine.trim(), location, pincode.trim()].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {pin && (
                <div className="summary-row">
                  <span className="k">{t('Map pin', { defaultValue: 'Map pin' })}</span>
                  <span className="v" style={{ color: '#047857' }}><Check size={15} /> {t('Saved', { defaultValue: 'Saved' })}</span>
                </div>
              )}
            </div>
            {result?.id !== undefined && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
                {t('Keep this number to follow up on your complaint.', { defaultValue: 'Keep this number to follow up on your complaint.' })}
              </p>
            )}
            <TranscriptBox result={result} />
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              {currentUser && (
                <button className="btn btn-primary" style={{ flex: '2 1 200px', borderRadius: 10 }} onClick={() => navigate('/dashboard')}>
                  {t('Track on my dashboard', { defaultValue: 'Track on my dashboard' })} <ArrowRight size={16} />
                </button>
              )}
              <button className="btn btn-outline" style={{ flex: '1 1 150px', borderRadius: 10 }} onClick={resetToStart}>{t("Report Another")}</button>
            </div>
            <ConfidenceDebug result={result} />
          </div>
          );
        })() : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {result?.prediction_set === 'Error' ? (
              <>
                <AlertTriangle size={56} style={{ marginBottom: '1.25rem', color: '#EF4444' }} />
                <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem', textAlign: 'center' }}>{t('Analysis failed', { defaultValue: 'Analysis failed' })}</h2>
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t("The AI encountered an error:")} <br/><strong style={{color: '#EF4444'}}>{result?.error || 'Unknown classification error'}</strong>
                </p>
                <button className="btn btn-outline" style={{ marginTop: '1.5rem', borderRadius: 10 }} onClick={resetToStart}>{t("Start Over")}</button>
              </>
            ) : (
              <div style={{ width: '100%' }}>
                <h2 style={{ color: 'var(--text-main)', marginBottom: '0.35rem', textAlign: 'center', fontSize: '1.5rem' }}>
                  {t('Which department should handle this?', { defaultValue: 'Which department should handle this?' })}
                </h2>
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.95rem' }}>
                  {t('Your complaint could belong to more than one department. Pick the one that fits best.', { defaultValue: 'Your complaint could belong to more than one department. Pick the one that fits best.' })}
                </p>
                <TranscriptBox result={result} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', margin: '1.5rem 0 1rem' }}>
                  {(result?.options?.length ? result.options : DEFAULT_OPTIONS).map((dept, i) => (
                    <button key={dept} type="button" className={`choice-card${i === 0 ? ' top' : ''}`} onClick={() => submitClarification(dept)}>
                      <DeptIcon prediction={dept} />
                      <span style={{ flex: 1 }}>{t(`${dept} Dept.`, { defaultValue: `${dept} Department` })}</span>
                      {i === 0 && result?.options?.length > 0 && (
                        <span className="tag" style={{ background: 'var(--accent)', color: '#fff' }}>{t('Most likely', { defaultValue: 'Most likely' })}</span>
                      )}
                      <ArrowRight size={16} color="#9CA3AF" />
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button type="button" className="link-btn" onClick={() => submitClarification('none_of_these')}>
                    <UserCheck size={15} /> {t('None of these – let an officer decide', { defaultValue: 'None of these – let an officer decide' })}
                  </button>
                  <button type="button" className="link-btn muted" onClick={resetToStart}><RotateCcw size={14} /> {t("Start Over")}</button>
                </div>
                <div style={{ textAlign: 'center' }}><ConfidenceDebug result={result} /></div>
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
