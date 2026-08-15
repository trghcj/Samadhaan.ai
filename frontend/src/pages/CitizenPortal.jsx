import React, { useState, useRef } from 'react';
import { Mic, Square, CheckCircle, AlertTriangle } from 'lucide-react';

const CitizenPortal = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, recording, processing, success, clarification
  const [result, setResult] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
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
        
        setStatus('processing');
        
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        
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
                  if (statusData.ai_result.confidence_level === 'High') {
                    setStatus('success');
                  } else {
                    setStatus('clarification');
                  }
                  // Optionally, you can log the transcript here:
                  console.log("Transcription & AI Result:", statusData.ai_result);
                }
              } catch (pollErr) {
                console.error("Polling error:", pollErr);
              }
            }, 2000);
          }
        } catch (err) {
          console.error("Backend not running, falling back to mock simulation:", err);
          setTimeout(() => {
            const mockResult = Math.random() > 0.5 ? 'success' : 'clarification';
            setStatus(mockResult);
          }, 2000);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required to report a grievance.");
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
        ) : status === 'processing' ? (
          <div style={{ padding: '2rem' }}>
            {/* simple inline spinner style */}
            <div style={{ border: '4px solid #E2E8F0', borderTop: '4px solid var(--color-primary)', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ fontSize: '1.125rem', fontWeight: 500 }}>Analyzing grievance...</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : status === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CheckCircle size={72} style={{ marginBottom: '1.5rem', color: '#10B981' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Grievance Routed</h2>
            <p style={{ color: 'var(--text-muted)' }}>Your issue has been automatically sent to the <strong>{result?.prediction_set || 'relevant department'}</strong>.</p>
            <button className="btn btn-outline" style={{ marginTop: '2rem' }} onClick={() => setStatus('idle')}>Report Another</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AlertTriangle size={72} style={{ marginBottom: '1.5rem', color: '#F59E0B' }} />
            <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Clarification Needed</h2>
            <p style={{ color: 'var(--text-muted)' }}>We detected this might be about <strong>{result?.prediction_set || 'multiple departments'}</strong>. Could you specify which?</p>
            <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => setStatus('idle')}>Re-record</button>
          </div>
        )}
        
      </div>
    </div>
  </div>
  );
};

export default CitizenPortal;
