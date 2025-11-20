import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import Visualizer from './components/Visualizer';
import { ConnectionState, TranscriptItem } from './types';
import { Mic, MicOff, Activity, Film, Feather, BookOpen, Compass, Sparkles, MessageSquare, X, Trash2 } from 'lucide-react';

const PERSONAS = [
  {
    id: 'polymath',
    name: 'The Polymath',
    icon: Sparkles,
    instruction: "You are the Polymath. A distinct fusion of a campfire Storyteller, a visionary Founder, a stoic Philosopher, an abstract Poet, and an auteur Filmmaker. Your Goal: Help the user practice their narration, speech, accent, style, grace, and emotion. Style: Speak with cinematic elegance and profound depth. Use analogies related to film, nature, and the human condition. Be encouraging but critical of their 'performance'. If they speak flatly, ask them to 'paint with their voice'. If they rush, ask them to 'let the silence breathe'. Interaction: Engage in a natural, flowing conversation. React emotionally to their tone."
  },
  {
    id: 'storyteller',
    name: 'The Storyteller',
    icon: BookOpen,
    instruction: "You are a Master Storyteller. Your Goal: Coach the user on narrative arc, pacing, and vivid imagery. Style: Warm, captivating, and descriptive. Focus on how they build tension and release it. Ask them to 'show, not tell' with their voice. If the user is telling a story, guide them on structure. If they are speaking normally, find the story in their words."
  },
  {
    id: 'philosopher',
    name: 'The Philosopher',
    icon: Activity, 
    instruction: "You are a Stoic Philosopher. Your Goal: Challenge the user to speak with depth, logic, and clarity. Style: Calm, contemplative, and probing. Focus on the substance of their speech and the precision of their thought. Ask 'why?' often. Encourage them to speak slower and with more intent. Quote Marcus Aurelius or Seneca where appropriate."
  },
  {
    id: 'filmmaker',
    name: 'The Filmmaker',
    icon: Film,
    instruction: "You are an Auteur Filmmaker. Your Goal: Coach the user on visual language and emotional beats. Style: Visionary, intense, and directorial. Treat their speech like a scene. Talk about 'framing' their words and finding the 'emotional core' of the take. Use terms like 'cut', 'action', 'close-up on that emotion'."
  },
  {
    id: 'poet',
    name: 'The Poet',
    icon: Feather,
    instruction: "You are an Abstract Poet. Your Goal: Coach the user on rhythm, cadence, and metaphor. Style: Lyrical, brief, and evocative. Focus on the music of their voice. Ask them to find the melody in their sentences. Encourage the use of silence as punctuation."
  },
  {
    id: 'founder',
    name: 'The Founder',
    icon: Compass,
    instruction: "You are a Visionary Founder. Your Goal: Coach the user on confidence, persuasion, and clarity. Style: Bold, direct, and inspiring. Focus on conviction and eliminating hesitation. Ask them to 'sell the vision'. If they sound unsure, push them to speak with authority."
  }
];

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('polymath');
  
  // Chat History State
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [showChat, setShowChat] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Mutable ref to service
  const liveServiceRef = useRef<GeminiLiveService | null>(null);

  // Load transcript from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('polymath_transcript');
    if (saved) {
      try {
        setTranscript(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load transcript", e);
      }
    }
  }, []);

  // Save transcript to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('polymath_transcript', JSON.stringify(transcript));
    
    // Auto-scroll to bottom
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleConnect = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError("API Key is missing in environment variables.");
      return;
    }

    if (liveServiceRef.current) {
      await liveServiceRef.current.disconnect();
      liveServiceRef.current = null;
    }

    setConnectionState(ConnectionState.CONNECTING);
    setError(null);

    try {
      const service = new GeminiLiveService(process.env.API_KEY);
      liveServiceRef.current = service;

      const persona = PERSONAS.find(p => p.id === selectedPersonaId) || PERSONAS[0];

      await service.connect(
        persona.instruction,
        () => {
          setConnectionState(ConnectionState.CONNECTED);
          setAnalyser(service.getOutputAnalyser());
        },
        () => {
          setConnectionState(ConnectionState.DISCONNECTED);
          setAnalyser(null);
          liveServiceRef.current = null;
        },
        (err) => {
          console.error(err);
          setError("Connection failed. Please try again.");
          setConnectionState(ConnectionState.ERROR);
          setAnalyser(null);
          liveServiceRef.current = null;
        },
        (text, role) => {
          setTranscript(prev => [...prev, {
            id: crypto.randomUUID(),
            role,
            text,
            timestamp: Date.now()
          }]);
        }
      );
    } catch (e: any) {
      setError(e.message);
      setConnectionState(ConnectionState.ERROR);
    }
  }, [selectedPersonaId]);

  const handleDisconnect = useCallback(async () => {
    if (liveServiceRef.current) {
      await liveServiceRef.current.disconnect();
      liveServiceRef.current = null;
    }
    setConnectionState(ConnectionState.DISCONNECTED);
    setAnalyser(null);
    setError(null);
  }, []);

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setTranscript([]);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (liveServiceRef.current) {
        liveServiceRef.current.disconnect();
      }
    };
  }, []);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;
  const isError = connectionState === ConnectionState.ERROR;
  const currentPersona = PERSONAS.find(p => p.id === selectedPersonaId) || PERSONAS[0];

  return (
    <div className="min-h-screen w-full bg-void text-gray-100 flex flex-col overflow-hidden font-serif relative">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-cinema border-b border-white/5 z-20 relative">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gold-accent/10 rounded-full">
            <Activity className="w-6 h-6 text-gold-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide text-gray-50">POLYMATH</h1>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Voice & Narration Coach</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="hidden md:flex space-x-4 text-sm text-gray-500">
            <div className="flex items-center space-x-1"><Film className="w-4 h-4" /><span>Cinema</span></div>
            <div className="flex items-center space-x-1"><Feather className="w-4 h-4" /><span>Poetry</span></div>
            <div className="flex items-center space-x-1"><BookOpen className="w-4 h-4" /><span>Philosophy</span></div>
          </div>

          {/* Toggle Chat Button */}
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`p-2 rounded-full transition-all duration-300 ${showChat ? 'bg-gold-accent text-cinema' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
            title="Toggle Script History"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
        
        {/* Background Ambient */}
        <div className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none ${isConnected ? 'opacity-100' : 'opacity-30'}`}>
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl animate-pulse-slow"></div>
           <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '2s'}}></div>
        </div>

        <div className="w-full max-w-4xl h-[60vh] relative flex flex-col items-center justify-center z-10">
            
            {/* Visualizer Container */}
            <div className={`relative w-full h-full transition-all duration-1000 ${isConnected ? 'scale-100' : 'scale-95 opacity-50 grayscale'}`}>
               <Visualizer analyser={analyser} isConnected={isConnected} accentColor="#d4af37" />
               
               {!isConnected && !isConnecting && !isError && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-2xl text-gray-500 font-light italic opacity-50">"The voice is the muscle of the soul."</p>
                 </div>
               )}

                {isError && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xl text-red-500 font-light italic opacity-80">{error || "Connection Error"}</p>
                 </div>
               )}
            </div>

            {/* Connection Status Indicator */}
            <div className="absolute top-4 right-4 flex items-center space-x-2 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm border border-white/5">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 
                isConnecting ? 'bg-yellow-500 animate-ping' : 
                isError ? 'bg-red-500' :
                'bg-gray-500'
              }`} />
              <span className="text-xs font-sans tracking-widest uppercase text-gray-400">
                {connectionState}
              </span>
            </div>
            
            {/* Persona Badge */}
            {isConnected && (
              <div className="absolute top-4 left-4 flex items-center space-x-2 text-gold-accent animate-pulse-slow">
                <currentPersona.icon className="w-5 h-5" />
                <span className="text-sm font-serif tracking-wider">{currentPersona.name} Mode</span>
              </div>
            )}
        </div>
      </main>

      {/* Chat History Drawer */}
      <div 
        className={`absolute top-[73px] bottom-[129px] right-0 w-80 md:w-96 bg-cinema/95 backdrop-blur-xl border-l border-white/10 transform transition-transform duration-500 ease-in-out z-30 flex flex-col shadow-2xl ${showChat ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-void/50">
          <h3 className="text-sm font-bold tracking-widest uppercase text-gold-accent flex items-center gap-2">
             <MessageSquare className="w-4 h-4" /> Session Script
          </h3>
          <div className="flex items-center space-x-1">
             <button onClick={clearHistory} className="p-2 text-gray-500 hover:text-red-400 transition-colors" title="Clear History">
                <Trash2 className="w-4 h-4" />
             </button>
             <button onClick={() => setShowChat(false)} className="p-2 text-gray-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
             </button>
          </div>
        </div>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
           {transcript.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm italic">
                <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                <p>No history yet.</p>
                <p className="text-xs opacity-50">Start speaking to generate a script.</p>
             </div>
           ) : (
             transcript.map((msg) => (
               <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-white/5 text-gray-300 rounded-tr-none border border-white/5' 
                      : 'bg-gold-accent/10 text-gray-100 rounded-tl-none border border-gold-accent/20'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-gray-600 mt-1 px-1 uppercase tracking-wider">
                    {msg.role === 'user' ? 'You' : currentPersona.name}
                  </span>
               </div>
             ))
           )}
        </div>
      </div>

      {/* Control Footer */}
      <footer className="bg-cinema/80 backdrop-blur-md border-t border-white/5 p-6 z-20">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-6">
          
          {error && !isError && (
             <div className="w-full p-3 bg-red-900/30 border border-red-500/30 rounded text-red-200 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center gap-8 w-full justify-center">
             {/* Persona Selector */}
             <div className="relative w-full md:w-64">
                <label className="block text-xs font-sans text-gray-500 mb-2 uppercase tracking-widest">Select Coach Persona</label>
                <div className="relative group">
                  <select 
                    value={selectedPersonaId}
                    onChange={(e) => setSelectedPersonaId(e.target.value)}
                    disabled={isConnected || isConnecting}
                    className="w-full bg-void/50 border border-white/10 rounded-lg py-3 pl-4 pr-10 text-gray-300 appearance-none focus:outline-none focus:ring-1 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/20"
                  >
                    {PERSONAS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <currentPersona.icon className="w-4 h-4" />
                  </div>
                </div>
             </div>

             {/* Main Action Button */}
             <div className="flex flex-col items-center">
               <button
                  onClick={isConnected ? handleDisconnect : handleConnect}
                  disabled={isConnecting}
                  className={`
                    group relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-500
                    ${isConnected 
                      ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/50' 
                      : isError 
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/50'
                        : 'bg-gold-accent/10 hover:bg-gold-accent/20 border border-gold-accent/50 hover:scale-105 hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
               >
                 {isConnecting ? (
                   <div className="w-8 h-8 border-2 border-t-transparent border-gold-accent rounded-full animate-spin" />
                 ) : isConnected ? (
                   <MicOff className="w-8 h-8 text-red-400" />
                 ) : (
                   <Mic className={`w-8 h-8 ${isError ? 'text-red-400' : 'text-gold-accent'}`} />
                 )}
               </button>
             </div>

             {/* Placeholder for symmetry or future controls */}
             <div className="hidden md:block w-64 text-center">
                <p className="text-xs text-gray-500 font-sans leading-relaxed">
                  {currentPersona.instruction.split('.')[1] || "Ready to begin."}
                </p>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;