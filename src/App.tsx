/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, Plus, Trash2, Volume2, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

interface Alarm {
  id: string;
  text: string;
  time: string; // ISO string
  triggered: boolean;
}

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [newText, setNewText] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load alarms from localStorage
  useEffect(() => {
    const savedAlarms = localStorage.getItem('mi-agenda-alarms');
    if (savedAlarms) {
      try {
        setAlarms(JSON.parse(savedAlarms));
      } catch (e) {
        console.error("Failed to parse alarms", e);
      }
    }
  }, []);

  // Save alarms to localStorage
  useEffect(() => {
    localStorage.setItem('mi-agenda-alarms', JSON.stringify(alarms));
  }, [alarms]);

  // Check for triggered alarms
  useEffect(() => {
    const checkAlarms = async () => {
      const now = new Date();
      const pendingAlarms = alarms.filter(a => !a.triggered && new Date(a.time) <= now);

      if (pendingAlarms.length > 0) {
        // Trigger the first pending alarm
        const alarm = pendingAlarms[0];
        await triggerAlarm(alarm);
      }
    };

    const interval = setInterval(checkAlarms, 2000);
    return () => clearInterval(interval);
  }, [alarms]);

  const triggerAlarm = async (alarm: Alarm) => {
    // Mark as triggered immediately to prevent double trigger
    setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, triggered: true } : a));
    
    try {
      await speakText(alarm.text);
      showStatus('info', `Alarma ejecutada: ${alarm.text}`);
    } catch (error) {
      console.error("TTS Error:", error);
      showStatus('error', "Error al generar la voz de la alarma.");
    }
  };

  const speakText = async (text: string) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API Key missing");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Dí con voz natural y clara: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore is a good natural voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      await playBase64Audio(base64Audio);
    }
  };

  const playBase64Audio = async (base64Data: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
  };

  const addAlarm = () => {
    if (!newText || !newTime) {
      showStatus('error', "Por favor, completa el texto y la fecha/hora.");
      return;
    }

    const alarmTime = new Date(newTime);
    if (alarmTime <= new Date()) {
      showStatus('error', "La fecha debe ser en el futuro.");
      return;
    }

    const newAlarm: Alarm = {
      id: crypto.randomUUID(),
      text: newText,
      time: newTime,
      triggered: false
    };

    setAlarms(prev => [...prev, newAlarm].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));
    setNewText('');
    setNewTime('');
    showStatus('success', "Alarma programada correctamente.");
  };

  const deleteAlarm = (id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const showStatus = (type: 'success' | 'error' | 'info', message: string) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 4000);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 font-sans selection:bg-emerald-500/30">
      {/* Header / Clock Section */}
      <header className="w-full max-w-2xl mt-8 mb-12 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-bold tracking-[0.3em] text-emerald-500 uppercase mb-4"
        >
          MI AGENDA
        </motion.h1>
        
        <div className="flex flex-col items-center">
          <motion.div 
            key={formatTime(currentTime)}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            className="text-6xl md:text-8xl font-mono font-bold tracking-tighter glow-text text-emerald-400"
          >
            {formatTime(currentTime)}
          </motion.div>
          <motion.div 
            className="text-sm md:text-lg text-emerald-500/60 font-medium mt-2 uppercase tracking-widest"
          >
            {formatDate(currentTime)}
          </motion.div>
        </div>
      </header>

      <main className="w-full max-w-2xl space-y-8">
        {/* Input Section */}
        <section className="glass-panel rounded-2xl p-6 glow-border">
          <h2 className="text-sm font-semibold text-emerald-500/80 mb-4 flex items-center gap-2">
            <Plus size={16} /> PROGRAMAR NUEVA ALARMA
          </h2>
          <div className="space-y-4">
            <div className="relative">
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="¿Qué quieres que te diga?"
                className="w-full bg-black/40 border border-emerald-500/20 rounded-xl p-4 text-emerald-100 placeholder:text-emerald-900 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none h-24"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="datetime-local"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full bg-black/40 border border-emerald-500/20 rounded-xl p-3 text-emerald-100 focus:outline-none focus:border-emerald-500/50 transition-colors [color-scheme:dark]"
                />
              </div>
              <button
                onClick={addAlarm}
                disabled={isProcessing}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black font-bold py-3 px-8 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isProcessing ? "PROCESANDO..." : "PROGRAMAR"}
              </button>
            </div>
          </div>
        </section>

        {/* Alarms List */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-emerald-500/80 flex items-center gap-2 px-2">
            <Bell size={16} /> PRÓXIMAS ALARMAS
          </h2>
          
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {alarms.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 text-emerald-900 italic"
                >
                  No hay alarmas programadas
                </motion.div>
              ) : (
                alarms.map((alarm) => (
                  <motion.div
                    key={alarm.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`glass-panel rounded-xl p-4 flex items-center justify-between group transition-all ${alarm.triggered ? 'opacity-40 grayscale' : 'hover:border-emerald-500/40'}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 p-2 rounded-lg ${alarm.triggered ? 'bg-emerald-900/20' : 'bg-emerald-500/10'}`}>
                        {alarm.triggered ? <CheckCircle2 size={18} className="text-emerald-700" /> : <Clock size={18} className="text-emerald-400" />}
                      </div>
                      <div>
                        <p className="text-emerald-100 font-medium line-clamp-2">{alarm.text}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-mono text-emerald-500/60">
                            {new Date(alarm.time).toLocaleString('es-ES', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                          {alarm.triggered && (
                            <span className="text-[10px] uppercase tracking-tighter text-emerald-700 font-bold">
                              EJECUTADA
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteAlarm(alarm.id)}
                      className="p-2 text-emerald-900 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Status Toasts */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl z-50 ${
              status.type === 'error' ? 'bg-red-900/90 text-red-100 border border-red-500/50' : 
              status.type === 'success' ? 'bg-emerald-900/90 text-emerald-100 border border-emerald-500/50' :
              'bg-blue-900/90 text-blue-100 border border-blue-500/50'
            }`}
          >
            {status.type === 'error' ? <AlertCircle size={18} /> : 
             status.type === 'success' ? <CheckCircle2 size={18} /> : 
             <Volume2 size={18} />}
            <span className="text-sm font-medium">{status.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Background Elements */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      </div>
    </div>
  );
}
