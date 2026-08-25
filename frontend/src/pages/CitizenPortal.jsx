import React, { useState, useRef } from 'react';
import { Mic, Square, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const CitizenPortal = () => {
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
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  const [beforePhoto, setBeforePhoto] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const startRecording = async () => {
    if (!currentUser) {
      const wantToLogin = window.confirm("Log in to track your grievance status on a personalized dashboard!\n\nClick OK to log in, or Cancel to report anonymously.");
      if (wantToLogin) {
        navigate('/auth');
        return;
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
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
    formData.append('file', audioData, 'recording.webm');
    
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
      const response = await fetch('https://samadhaan-ai.onrender.com/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.task_id) {
        // Start polling the status endpoint every 2 seconds
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`https://samadhaan-ai.onrender.com/api/status/${data.task_id}`);
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
              setStatus('idle');
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
      console.error("Backend error, mock fallback:", err);
      setTimeout(() => {
        const mockResult = Math.random() > 0.5 ? 'success' : 'clarification';
        setStatus(mockResult);
      }, 2000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div>
      {/* Dark Hero Section like TestFit */}
      <div className="section-dark">
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>
          Communicate with your city, starting from an AI-generated grievance plan.
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto 2rem auto' }}>
          Report a municipal issue simply by using your voice. Speak naturally in your native language and let Samadhaan.ai route it instantly.
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
          </>
        ) : status === 'form' ? (
          <form onSubmit={submitGrievanceForm} style={{ width: '100%', textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700 }}>Just a few more details...</h2>
            
            {!currentUser && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Full Name *</label>
                  <input type="text" value={reporterName} onChange={e => setReporterName(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. Ramesh Kumar" />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Phone Number *</label>
                  <input type="tel" value={reporterPhone} onChange={e => setReporterPhone(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. +91 98765 43210" />
                </div>
              </>
            )}
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Location / Village *</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="E.g. Near main square, Palampur" />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Extra Details (Optional)</label>
              <textarea value={extraDetails} onChange={e => setExtraDetails(e.target.value)} rows="3" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} placeholder="Any other context we should know?" />
            </div>
            
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>"Before" Photo (Optional)</label>
              <input type="file" accept="image/*" onChange={(e) => setBeforePhoto(e.target.files[0])} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '1rem' }} onClick={() => setStatus('idle')}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '1rem' }}>Submit Grievance</button>
            </div>
          </form>
        ) : status === 'processing' ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            {/* simple inline spinner style */}
            <div style={{ border: '4px solid #E2E8F0', borderTop: '4px solid var(--color-primary)', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ fontSize: '1.125rem', fontWeight: 500 }}>{statusStep || 'Analyzing grievance...'}</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : status === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <CheckCircle size={72} style={{ marginBottom: '1.5rem', color: '#10B981' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Grievance Routed</h2>
            {result?.confidence_level === 'Low' ? (
              <p style={{ color: 'var(--text-muted)' }}>We were unable to confidently categorize your issue automatically. It has been sent directly to a <strong>Human Operator</strong> for manual review.</p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Your issue has been automatically sent to the <strong>{result?.prediction_set || 'relevant department'}</strong>.</p>
            )}
            <button className="btn btn-outline" style={{ marginTop: '2rem' }} onClick={() => setStatus('idle')}>Report Another</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AlertTriangle size={72} style={{ marginBottom: '1.5rem', color: '#F59E0B' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem', textAlign: 'center' }}>
              {result?.prediction_set === 'Error' ? 'Analysis Failed' : 'We Need More Info'}
            </h2>
            {result?.prediction_set === 'Error' ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                The AI encountered an error: <br/><strong style={{color: '#EF4444'}}>{result?.error || 'Unknown classification error'}</strong>
              </p>
            ) : (
              <div style={{ width: '100%' }}>
                <div style={{ padding: '1rem', backgroundColor: '#FEF3C7', borderRadius: 'var(--radius-sm)', color: '#92400E', marginBottom: '1.5rem' }}>
                  <strong>Question from AI:</strong><br/>
                  {result?.clarifying_question || "We detected multiple possible departments. Could you provide a bit more detail to help us route this correctly?"}
                </div>
                
                <textarea 
                  value={clarifyAnswer} 
                  onChange={e => setClarifyAnswer(e.target.value)} 
                  rows="3" 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', marginBottom: '1rem' }} 
                  placeholder="Type your answer here..." 
                />
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStatus('idle')}>Start Over</button>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 2 }} 
                    onClick={async () => {
                      if(!clarifyAnswer.trim()) return alert("Please enter an answer.");
                      setStatus('processing');
                      setStatusStep('Saving your answer...');
                      try {
                        await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${result.id}/clarify`, {
                          method: 'PATCH',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({answer: clarifyAnswer})
                        });
                        setStatus('success');
                        setClarifyAnswer('');
                      } catch(e) {
                        console.error(e);
                        alert("Failed to submit clarification");
                        setStatus('clarification');
                      }
                    }}
                  >
                    Submit Answer
                  </button>
                </div>
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
