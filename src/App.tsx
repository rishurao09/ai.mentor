import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  Settings, 
  BookOpen, 
  AlertCircle, 
  X, 
  Home, 
  User, 
  Heart, 
  Award, 
  Calendar,
  Briefcase,
  Coffee,
  MessageSquare,
  Send,
  ChevronDown
} from 'lucide-react';
import { 
  getProgress, 
  getApiKey, 
  saveApiKey, 
  saveSession, 
  getModel, 
  saveModel, 
  getSessions, 
  clearSessions 
} from './services/memory';
import type { PracticeSession } from './services/memory';
import { analyzeSpeech } from './services/llm';
import type { ChatMessage } from './services/llm';

interface ConversationTurn {
  id: string;
  role: 'user' | 'ai';
  text: string;
  corrections?: string[];
  vocabulary?: { word: string; def: string }[];
}

const SCENARIOS = [
  { 
    id: 'Casual Conversation', 
    label: 'Chat', 
    iconName: 'MessageSquare', 
    greeting: "I'm here and ready to chat! What's on your mind?" 
  },
  { 
    id: 'Job Interview', 
    label: 'Interview Mode', 
    iconName: 'Briefcase', 
    greeting: "Hello! Welcome to your mock interview. Let's practice. Can you start by introducing yourself and telling me a little bit about your professional background?" 
  },
  { 
    id: 'Ordering at a Cafe', 
    label: 'Cafe Talk', 
    iconName: 'Coffee', 
    greeting: "Welcome to Gemini Cafe! What can I get started for you today?" 
  }
];

const VAD_TIMEOUT_MS = 2500;

// ── Animated SVG Backgrounds ──────────────────────────────────────────────────

function ChatBg() {
  return (
    <svg className="section-bg-svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cg1" cx="20%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#00F5FF" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <radialGradient id="cg2" cx="80%" cy="70%" r="50%">
          <stop offset="0%" stopColor="#0077ff" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="700" fill="#060a12"/>
      <rect width="1200" height="700" fill="url(#cg1)"/>
      <rect width="1200" height="700" fill="url(#cg2)"/>
      {/* Grid lines */}
      {Array.from({length: 14}).map((_,i) => (
        <line key={`h${i}`} x1="0" y1={i*50} x2="1200" y2={i*50} stroke="#00F5FF" strokeOpacity="0.04" strokeWidth="1"/>
      ))}
      {Array.from({length: 25}).map((_,i) => (
        <line key={`v${i}`} x1={i*50} y1="0" x2={i*50} y2="700" stroke="#00F5FF" strokeOpacity="0.04" strokeWidth="1"/>
      ))}
      {/* Neural nodes */}
      {[
        [150,180],[400,120],[700,200],[950,140],[1100,300],
        [200,400],[500,350],[800,420],[1050,500],[300,560],[650,580]
      ].map(([x,y],i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#00F5FF" opacity="0.6">
            <animate attributeName="opacity" values="0.3;0.9;0.3" dur={`${2.5+i*0.4}s`} repeatCount="indefinite"/>
          </circle>
          <circle cx={x} cy={y} r="12" fill="none" stroke="#00F5FF" strokeOpacity="0.15">
            <animate attributeName="r" values="8;18;8" dur={`${3+i*0.3}s`} repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="0.2;0;0.2" dur={`${3+i*0.3}s`} repeatCount="indefinite"/>
          </circle>
        </g>
      ))}
      {/* Connection lines */}
      {[
        [150,180,400,120],[400,120,700,200],[700,200,950,140],[950,140,1100,300],
        [200,400,500,350],[500,350,800,420],[800,420,1050,500],
        [300,560,650,580],[650,580,950,140]
      ].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#00F5FF" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" values="0;-48" dur={`${4+i*0.5}s`} repeatCount="indefinite"/>
        </line>
      ))}
    </svg>
  );
}

function InterviewBg() {
  return (
    <svg className="section-bg-svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ig1" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#FFB800" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <radialGradient id="ig2" cx="85%" cy="20%" r="40%">
          <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="700" fill="#0e0900"/>
      <rect width="1200" height="700" fill="url(#ig1)"/>
      <rect width="1200" height="700" fill="url(#ig2)"/>
      {/* Hexagon grid */}
      {[0,1,2,3,4,5,6,7].map(row =>
        [0,1,2,3,4,5,6,7,8,9].map(col => {
          const x = col * 130 + (row % 2 === 0 ? 0 : 65);
          const y = row * 110 - 50;
          const pts = Array.from({length:6}).map((_,i) => {
            const a = Math.PI/180*(60*i-30);
            return `${x+50*Math.cos(a)},${y+50*Math.sin(a)}`;
          }).join(' ');
          return <polygon key={`${row}-${col}`} points={pts} fill="none" stroke="#FFB800" strokeOpacity="0.05" strokeWidth="1"/>;
        })
      )}
      {/* Pulse rings from center */}
      {[80,160,240,320,400].map((r,i) => (
        <circle key={i} cx="600" cy="350" r={r} fill="none" stroke="#FFB800" strokeOpacity="0.06">
          <animate attributeName="r" values={`${r};${r+30};${r}`} dur={`${3+i*0.7}s`} repeatCount="indefinite"/>
          <animate attributeName="stroke-opacity" values="0.08;0.02;0.08" dur={`${3+i*0.7}s`} repeatCount="indefinite"/>
        </circle>
      ))}
      {/* Floating squares */}
      {[[100,100],[300,200],[900,150],[1050,400],[200,500],[750,550]].map(([x,y],i) => (
        <rect key={i} x={x-15} y={y-15} width="30" height="30" fill="none" stroke="#FFB800" strokeOpacity="0.2" strokeWidth="1" transform={`rotate(45 ${x} ${y})`}>
          <animateTransform attributeName="transform" type="rotate" values={`45 ${x} ${y};90 ${x} ${y};45 ${x} ${y}`} dur={`${4+i*0.8}s`} repeatCount="indefinite"/>
        </rect>
      ))}
    </svg>
  );
}

function CafeBg() {
  return (
    <svg className="section-bg-svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="kg1" cx="30%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#7B2FFF" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <radialGradient id="kg2" cx="75%" cy="35%" r="45%">
          <stop offset="0%" stopColor="#FF2FA0" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="700" fill="#080412"/>
      <rect width="1200" height="700" fill="url(#kg1)"/>
      <rect width="1200" height="700" fill="url(#kg2)"/>
      {/* Wave lines */}
      {[0,1,2,3,4,5,6].map(i => (
        <path key={i} d={`M 0 ${100+i*90} Q 300 ${80+i*90} 600 ${100+i*90} Q 900 ${120+i*90} 1200 ${100+i*90}`}
          fill="none" stroke="#7B2FFF" strokeOpacity="0.08" strokeWidth="1.5">
          <animate attributeName="d" 
            values={`M 0 ${100+i*90} Q 300 ${80+i*90} 600 ${100+i*90} Q 900 ${120+i*90} 1200 ${100+i*90};M 0 ${100+i*90} Q 300 ${130+i*90} 600 ${100+i*90} Q 900 ${70+i*90} 1200 ${100+i*90};M 0 ${100+i*90} Q 300 ${80+i*90} 600 ${100+i*90} Q 900 ${120+i*90} 1200 ${100+i*90}`}
            dur={`${5+i*0.6}s`} repeatCount="indefinite"/>
        </path>
      ))}
      {/* Floating particles */}
      {[[200,200],[500,150],[850,250],[1100,180],[150,450],[400,500],[700,430],[1000,380],[300,600],[600,620],[900,580]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#7B2FFF" opacity="0.5">
          <animate attributeName="cy" values={`${y};${y-20};${y}`} dur={`${3+i*0.5}s`} repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur={`${2.5+i*0.4}s`} repeatCount="indefinite"/>
        </circle>
      ))}
      {/* Neon arcs */}
      {[200,350,500].map((r,i) => (
        <path key={i} d={`M ${600-r} 350 A ${r} ${r} 0 0 1 ${600+r} 350`} 
          fill="none" stroke="#7B2FFF" strokeOpacity="0.07" strokeWidth="1">
          <animate attributeName="stroke-opacity" values="0.05;0.14;0.05" dur={`${4+i}s`} repeatCount="indefinite"/>
        </path>
      ))}
    </svg>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'chat' | 'profile'>('landing');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const conversationRef = useRef(conversation);
  useEffect(() => { conversationRef.current = conversation; }, [conversation]);

  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0].id);
  const activeScenarioRef = useRef(activeScenario);
  useEffect(() => { activeScenarioRef.current = activeScenario; }, [activeScenario]);

  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [speechSpeed, setSpeechSpeed] = useState(0.95);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  
  const [progress, setProgress] = useState(getProgress());
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<PracticeSession | null>(null);
  const [likedMessages, setLikedMessages] = useState<Record<string, boolean>>({});
  const [heartAnims, setHeartAnims] = useState<Record<string, boolean>>({});

  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const latestTranscriptRef = useRef('');
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, transcript]);

  useEffect(() => {
    setSessions(getSessions());
    setApiKeyInput(getApiKey());
    setSelectedModel(getModel());
    const storedSpeed = localStorage.getItem('speech_speed');
    if (storedSpeed) setSpeechSpeed(parseFloat(storedSpeed));

    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const enVoices = allVoices.filter(v => v.lang.startsWith('en-') || v.lang.startsWith('en_'));
      setVoices(enVoices);
      const storedVoiceName = localStorage.getItem('speech_voice');
      if (storedVoiceName && enVoices.some(v => v.name === storedVoiceName)) {
        setSelectedVoiceName(storedVoiceName);
      } else {
        const bestVoice = enVoices.find(v => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft David')) || enVoices[0];
        if (bestVoice) { setSelectedVoiceName(bestVoice.name); localStorage.setItem('speech_voice', bestVoice.name); }
      }
    };
    updateVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => { window.speechSynthesis.cancel(); clearSilenceTimeout(); };
  }, []);

  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null; }
  };

  const speak = async (text: string) => {
    stopSpeaking();
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const allVoices = synth.getVoices();
    const englishVoice = allVoices.find(v => v.name === selectedVoiceName) || 
                         allVoices.find(v => v.lang.startsWith('en-') && (v.name.includes('Natural') || v.name.includes('Google'))) || 
                         allVoices.find(v => v.lang.startsWith('en-'));
    if (englishVoice) utterance.voice = englishVoice;
    utterance.rate = speechSpeed;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
  };

  const stopSpeaking = () => { window.speechSynthesis.cancel(); setIsSpeaking(false); };

  const processFeedback = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) return;
    setIsProcessing(true);
    setIsRecording(false);
    recognitionRef.current?.stop();
    clearSilenceTimeout();
    const userMessageId = Date.now().toString();
    const newUserTurn: ConversationTurn = { id: userMessageId, role: 'user', text: finalTranscript };
    setConversation(prev => [...prev, newUserTurn]);
    setTranscript('');
    latestTranscriptRef.current = '';
    const history: ChatMessage[] = conversationRef.current.map(turn => ({
      role: turn.role === 'ai' ? 'assistant' : 'user',
      content: turn.text
    }));
    try {
      const apiKey = getApiKey();
      const model = getModel();
      const result = await analyzeSpeech(finalTranscript, apiKey, history, activeScenarioRef.current, model);
      const aiResponseTurn: ConversationTurn = {
        id: (Date.now() + 1).toString(), role: 'ai', text: result.spokenResponse,
        corrections: result.corrections, vocabulary: result.vocabulary
      };
      setConversation(prev => [...prev, aiResponseTurn]);
      await speak(result.spokenResponse);
      saveSession({ id: Date.now().toString(), date: new Date().toISOString(), scenario: activeScenarioRef.current, transcript: finalTranscript, feedback: result });
      setProgress(getProgress());
      setSessions(getSessions());
    } catch (error: any) {
      const isApiKeyErr = error.message?.includes('API key') || error.message?.includes('key') || error.message?.includes('400');
      const errMessageText = isApiKeyErr
        ? "Google Gemini API Key is missing or invalid. Please click 'Settings' to paste a valid API key."
        : `Sorry, I had trouble connecting: ${error.message || 'Unknown network error'}. Please try again.`;
      const aiErrorTurn: ConversationTurn = { id: (Date.now() + 1).toString(), role: 'ai', text: errMessageText };
      setConversation(prev => [...prev, aiErrorTurn]);
      await speak(errMessageText);
    } finally {
      setIsProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechSpeed]);

  const handleSendText = () => {
    if (isSpeaking) stopSpeaking();
    if (textInput.trim()) { processFeedback(textInput.trim()); setTextInput(''); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) handleSendText();
  };

  useEffect(() => {
    setTimeout(() => greetUser(SCENARIOS[0].id), 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greetUser = async (scenarioId: string) => {
    const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
    setConversation([{ id: Date.now().toString(), role: 'ai', text: scenario.greeting }]);
    await speak(scenario.greeting);
  };

  const handleScenarioChange = (scenarioId: string) => {
    if (isRecording || isProcessing || isSpeaking) return;
    setActiveScenario(scenarioId);
    greetUser(scenarioId);
  };

  const launchMode = (scenarioId: string) => {
    setActiveScenario(scenarioId);
    greetUser(scenarioId);
    setActiveTab('chat');
  };

  const toggleRecording = () => {
    if (isSpeaking) stopSpeaking();
    if (isRecording) {
      clearSilenceTimeout();
      const currentText = latestTranscriptRef.current || transcript;
      if (currentText.trim().length > 1) { processFeedback(currentText); }
      else { setIsRecording(false); try { recognitionRef.current?.stop(); } catch (e) {} }
    } else {
      setIsRecording(true); setTranscript(''); latestTranscriptRef.current = '';
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        setConversation(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: "Speech recognition is not supported. Please use Chrome or Edge." }]);
        setIsRecording(false); return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        let ct = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) ct += event.results[i][0].transcript;
        setTranscript(ct); latestTranscriptRef.current = ct;
        clearSilenceTimeout();
        if (ct.trim().length > 0) {
          silenceTimeoutRef.current = setTimeout(() => {
            if (latestTranscriptRef.current.length > 2) processFeedback(latestTranscriptRef.current);
          }, VAD_TIMEOUT_MS);
        }
      };
      recognition.onerror = (event: any) => {
        clearSilenceTimeout();
        if (event.error === 'not-allowed') {
          setConversation(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: "Microphone access blocked. Please allow microphone in your browser settings." }]);
        }
        setIsRecording(false);
      };
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
      try { recognition.start(); } catch (e) { setIsRecording(false); }
    }
  };

  const handleSaveSettings = () => { saveApiKey(apiKeyInput); saveModel(selectedModel); localStorage.setItem('speech_speed', speechSpeed.toString()); setShowSettings(false); };
  const handleClearHistory = () => {
    if (confirm("Delete all practice history?")) { clearSessions(); setSessions([]); setProgress(getProgress()); setShowSettings(false); }
  };
  const handleMessageLike = (messageId: string) => {
    const isLiked = likedMessages[messageId];
    setLikedMessages(prev => ({ ...prev, [messageId]: !isLiked }));
    if (!isLiked) {
      setHeartAnims(prev => ({ ...prev, [messageId]: true }));
      setTimeout(() => setHeartAnims(prev => ({ ...prev, [messageId]: false })), 700);
    }
  };

  // ── Landing (scroll-snap sections) ───────────────────────────────────────────
  if (activeTab === 'landing') {
    return (
      <div className="landing-root">
        {/* Sticky top bar */}
        <header className="landing-topbar">
          <span className="landing-logo">Mentor<span className="logo-dot">.ai</span></span>
          <nav className="landing-topnav">
            <button className="topnav-btn" onClick={() => setActiveTab('chat')}>Practice</button>
            <button className="topnav-btn" onClick={() => setActiveTab('profile')}>Profile</button>
            <button className="topnav-settings" onClick={() => { setApiKeyInput(getApiKey()); setSelectedModel(getModel()); setShowSettings(true); }}>
              <Settings size={16}/>
            </button>
          </nav>
        </header>

        {/* Scroll container */}
        <div className="sections-scroll" ref={sectionsRef}>

          {/* ── Hero Section ── */}
          <section className="snap-section hero-section">
            <ChatBg />
            <div className="section-content hero-content">
              <div className="hero-eyebrow">AI-POWERED ENGLISH MENTOR</div>
              <h1 className="hero-headline">
                Speak better.<br/>
                <span className="headline-accent cyan">Every conversation.</span>
              </h1>
              <p className="hero-subtext">
                Real-time feedback, grammar corrections & vocabulary coaching — across three immersive practice modes.
              </p>
              <div className="hero-ctas">
                <button className="cta-primary" onClick={() => launchMode('Casual Conversation')}>
                  Start Practicing
                </button>
                <button className="cta-ghost" onClick={() => {
                  sectionsRef.current?.children[1]?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  Explore Modes
                </button>
              </div>
              <div className="scroll-hint">
                <ChevronDown size={20}/>
                <span>scroll to explore</span>
              </div>
            </div>
          </section>

          {/* ── Chat Mode Section ── */}
          <section className="snap-section mode-section chat-mode">
            <ChatBg />
            <div className="section-content mode-content">
              <div className="mode-badge" style={{color:'#00F5FF', borderColor:'rgba(0,245,255,0.3)', background:'rgba(0,245,255,0.07)'}}>
                <MessageSquare size={14}/> MODE 01
              </div>
              <h2 className="mode-title">
                Free<br/><span className="mode-title-accent" style={{color:'#00F5FF'}}>Chat</span>
              </h2>
              <p className="mode-description">
                Talk about anything — your day, hobbies, ideas. Alex listens, responds naturally, and quietly corrects your grammar and suggests better vocabulary. No pressure, just conversation.
              </p>
              <ul className="mode-features">
                <li><span className="feat-dot" style={{background:'#00F5FF'}}/>Real-time grammar corrections</li>
                <li><span className="feat-dot" style={{background:'#00F5FF'}}/>Contextual vocabulary suggestions</li>
                <li><span className="feat-dot" style={{background:'#00F5FF'}}/>Voice + text input</li>
                <li><span className="feat-dot" style={{background:'#00F5FF'}}/>Natural flowing conversation</li>
              </ul>
              <button className="mode-cta" style={{'--accent':'#00F5FF', '--accent-dim':'rgba(0,245,255,0.15)'} as React.CSSProperties}
                onClick={() => launchMode('Casual Conversation')}>
                Launch Chat Mode →
              </button>
            </div>
            <div className="mode-visual chat-visual">
              <div className="mock-chat">
                <div className="mock-bubble ai-mock">Hey! What's on your mind today? 😊</div>
                <div className="mock-bubble user-mock">I goed to the market this morning.</div>
                <div className="mock-correction">
                  <span className="corr-label">✦ CORRECTION</span>
                  <span>"I <strong>went</strong> to the market this morning." — past tense of 'go' is 'went'</span>
                </div>
                <div className="mock-bubble ai-mock">Great! I went to the market — let's keep going!</div>
              </div>
            </div>
          </section>

          {/* ── Interview Mode Section ── */}
          <section className="snap-section mode-section interview-mode">
            <InterviewBg />
            <div className="mode-visual interview-visual">
              <div className="mock-interview">
                <div className="interview-card">
                  <div className="interview-icon">💼</div>
                  <div className="interview-q">Tell me about a challenge you overcame at work.</div>
                </div>
                <div className="mock-bubble user-mock" style={{borderColor:'rgba(255,184,0,0.3)'}}>In my last job I was responsible for...</div>
                <div className="mock-vocab">
                  <span className="vocab-label">✦ VOCABULARY</span>
                  <span><strong>Spearheaded</strong> — led or initiated with energy</span>
                </div>
              </div>
            </div>
            <div className="section-content mode-content">
              <div className="mode-badge" style={{color:'#FFB800', borderColor:'rgba(255,184,0,0.3)', background:'rgba(255,184,0,0.07)'}}>
                <Briefcase size={14}/> MODE 02
              </div>
              <h2 className="mode-title">
                Mock<br/><span className="mode-title-accent" style={{color:'#FFB800'}}>Interview</span>
              </h2>
              <p className="mode-description">
                Practice job interviews with a sharp AI interviewer. Get asked real questions, receive feedback on your answers, and learn professional vocabulary that impresses hiring managers.
              </p>
              <ul className="mode-features">
                <li><span className="feat-dot" style={{background:'#FFB800'}}/>Realistic interview questions</li>
                <li><span className="feat-dot" style={{background:'#FFB800'}}/>Professional vocabulary coaching</li>
                <li><span className="feat-dot" style={{background:'#FFB800'}}/>Answer structure feedback</li>
                <li><span className="feat-dot" style={{background:'#FFB800'}}/>Confidence-building repetition</li>
              </ul>
              <button className="mode-cta" style={{'--accent':'#FFB800', '--accent-dim':'rgba(255,184,0,0.15)'} as React.CSSProperties}
                onClick={() => launchMode('Job Interview')}>
                Launch Interview Mode →
              </button>
            </div>
          </section>

          {/* ── Café Talk Section ── */}
          <section className="snap-section mode-section cafe-mode">
            <CafeBg />
            <div className="section-content mode-content">
              <div className="mode-badge" style={{color:'#A855F7', borderColor:'rgba(168,85,247,0.3)', background:'rgba(168,85,247,0.07)'}}>
                <Coffee size={14}/> MODE 03
              </div>
              <h2 className="mode-title">
                Café<br/><span className="mode-title-accent" style={{color:'#A855F7'}}>Talk</span>
              </h2>
              <p className="mode-description">
                Step into Gemini Café and practice ordering, small talk, and everyday English in a relaxed setting. Perfect for building confidence in real-world social situations.
              </p>
              <ul className="mode-features">
                <li><span className="feat-dot" style={{background:'#A855F7'}}/>Everyday situational English</li>
                <li><span className="feat-dot" style={{background:'#A855F7'}}/>Social confidence building</li>
                <li><span className="feat-dot" style={{background:'#A855F7'}}/>Casual tone coaching</li>
                <li><span className="feat-dot" style={{background:'#A855F7'}}/>Natural phrase suggestions</li>
              </ul>
              <button className="mode-cta" style={{'--accent':'#A855F7', '--accent-dim':'rgba(168,85,247,0.15)'} as React.CSSProperties}
                onClick={() => launchMode('Ordering at a Cafe')}>
                Launch Café Mode →
              </button>
            </div>
            <div className="mode-visual cafe-visual">
              <div className="mock-cafe">
                <div className="cafe-header">☕ Gemini Café</div>
                <div className="mock-bubble ai-mock" style={{borderColor:'rgba(168,85,247,0.3)'}}>Welcome! What can I get you?</div>
                <div className="mock-bubble user-mock" style={{borderColor:'rgba(168,85,247,0.3)'}}>Can I get a large latte please?</div>
                <div className="mock-bubble ai-mock" style={{borderColor:'rgba(168,85,247,0.3)'}}>One large latte coming up! Anything else? 😊</div>
              </div>
            </div>
          </section>

        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
              <header className="post-detail-header">
                <h3>Settings</h3>
                <button className="close-btn" onClick={() => setShowSettings(false)}><X size={18}/></button>
              </header>
              <div className="settings-form">
                <div className="form-group">
                  <label className="form-label">Gemini API Key</label>
                  <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="Paste your Gemini API key here..." className="form-input"/>
                  <span className="form-hint">Stored locally. Never shared.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="form-input" style={{background:'var(--bg-black)'}}>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Speaking Speed: {speechSpeed}x</label>
                  <input type="range" min="0.7" max="1.3" step="0.05" value={speechSpeed} onChange={e => setSpeechSpeed(parseFloat(e.target.value))} style={{accentColor:'#e6683c'}}/>
                </div>
                <button className="btn-primary" onClick={handleSaveSettings}>Save & Close</button>
                <button className="btn-danger" onClick={handleClearHistory}>Reset All Practice Data</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Chat / Profile App View ───────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-container">
          <button className="brand-logo-btn" onClick={() => setActiveTab('landing')}>Mentor.ai</button>
          <nav className="nav-links">
            <button className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              <div className="nav-icon-box"><Home size={18}/></div>PRACTICE
            </button>
            <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
              <div className="nav-icon-box"><User size={18}/></div>PROFILE
            </button>
          </nav>
        </div>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => { setApiKeyInput(getApiKey()); setSelectedModel(getModel()); setShowSettings(true); }}>
            <div className="nav-icon-box"><Settings size={18}/></div>SETTINGS
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <nav className="mobile-nav">
        <button className={`mobile-nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><Home size={20}/>PRACTICE</button>
        <button className={`mobile-nav-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}><User size={20}/>PROFILE</button>
        <button className="mobile-nav-btn" onClick={() => { setApiKeyInput(getApiKey()); setSelectedModel(getModel()); setShowSettings(true); }}><Settings size={20}/>SETTINGS</button>
      </nav>

      <main className="main-content">
        {activeTab === 'chat' && (
          <>
            <header className="top-nav">
              <button className="top-nav-back" onClick={() => setActiveTab('landing')}>← Home</button>
              <span className="top-nav-title">English Mentoring</span>
              <button className="btn-secondary" onClick={() => { setApiKeyInput(getApiKey()); setSelectedModel(getModel()); setShowSettings(true); }}>
                <Settings size={14}/> SETTINGS
              </button>
            </header>
            <div className="scenarios-tabs-bar">
              {SCENARIOS.map(scenario => {
                const isActive = activeScenario === scenario.id;
                return (
                  <button key={scenario.id} className={`scenario-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => handleScenarioChange(scenario.id)} disabled={isRecording || isProcessing || isSpeaking}>
                    {scenario.iconName === 'MessageSquare' && <MessageSquare size={16}/>}
                    {scenario.iconName === 'Briefcase' && <Briefcase size={16}/>}
                    {scenario.iconName === 'Coffee' && <Coffee size={16}/>}
                    <span>{scenario.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="chat-layout-wrapper">
              <div className="chat-feed-column">
                <div className="chat-container">
                  {conversation.length <= 1 && (
                    <div className="chat-suggestions-container">
                      <span className="suggestions-title">Tap a prompt to start practicing:</span>
                      <div className="suggestions-grid">
                        <button className="suggestion-chip" onClick={() => setTextInput("Let's talk about my favorite hobbies.")}>💬 Discuss Hobbies</button>
                        <button className="suggestion-chip" onClick={() => setTextInput("Can you ask me common job interview questions?")}>💼 Job Interview Practice</button>
                        <button className="suggestion-chip" onClick={() => setTextInput("I want to practice ordering a hot coffee and croissant.")}>☕ Cafe Roleplay Chat</button>
                      </div>
                    </div>
                  )}
                  {conversation.map(turn => (
                    <div key={turn.id} className={`chat-message ${turn.role}`}>
                      <div className="chat-bubble-container" onDoubleClick={() => turn.role === 'ai' && handleMessageLike(turn.id)}>
                        <div className="chat-bubble">
                          {turn.text}
                          {likedMessages[turn.id] && (
                            <div className="bubble-liked-indicator" onClick={() => handleMessageLike(turn.id)}><Heart size={10} fill="currentColor"/></div>
                          )}
                        </div>
                        {heartAnims[turn.id] && <div className="heart-pop animate"><Heart size={44} fill="currentColor"/></div>}
                      </div>
                      {turn.role === 'ai' && (turn.corrections?.length || turn.vocabulary?.length) ? (
                        <div className="corrections-panel">
                          {turn.corrections && turn.corrections.length > 0 && (
                            <div className="feedback-section-box">
                              <h4 className="corrections-section-title errors"><AlertCircle size={13}/> MENTOR FEEDBACK</h4>
                              <div className="corrections-content-card">
                                <ul className="correction-list">{turn.corrections.map((c,i) => <li key={i} className="correction-item">{c}</li>)}</ul>
                              </div>
                            </div>
                          )}
                          {turn.vocabulary && turn.vocabulary.length > 0 && (
                            <div className="feedback-section-box">
                              <h4 className="corrections-section-title vocab"><BookOpen size={13}/> VOCABULARY</h4>
                              <div className="corrections-content-card">
                                <div className="vocab-grid">
                                  {turn.vocabulary.map((v,i) => (
                                    <div key={i} className="vocab-row">
                                      <div className="vocab-word">{v.word}</div>
                                      <div className="vocab-def">{v.def}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {(isRecording || transcript) && (
                    <div className="chat-message user">
                      <div className="chat-bubble" style={{opacity: transcript ? 1 : 0.55}}>{transcript || "Listening..."}</div>
                    </div>
                  )}
                  <div ref={chatEndRef}/>
                </div>
              </div>
            </div>
            <div className="control-area">
              <div className="input-row-container">
                <div className="text-input-bar">
                  <input type="text" placeholder={isRecording ? "Listening to your voice..." : "Type your message..."}
                    value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={handleKeyDown}
                    disabled={isProcessing} className="chat-text-input"/>
                  <button className={`mic-trigger-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} disabled={isProcessing}><Mic size={18}/></button>
                </div>
                <button className="send-trigger-btn" onClick={handleSendText} disabled={isProcessing || (!textInput.trim() && !isRecording)}><Send size={18}/></button>
              </div>
              <div className="status-text">
                {isProcessing ? 'Mentor is thinking...' : isSpeaking ? (
                  <div className="speaking-indicator" onClick={stopSpeaking} style={{cursor:'pointer'}}>
                    Mentor speaking (tap to stop) <div className="speaking-bar"/><div className="speaking-bar"/><div className="speaking-bar"/>
                  </div>
                ) : 'Double-tap any AI message to like it'}
              </div>
            </div>
          </>
        )}

        {activeTab === 'profile' && (
          <div className="profile-container">
            <div className="profile-header">
              <div className="profile-avatar-container">
                <div className="profile-avatar"><div className="profile-avatar-inner">EL</div></div>
              </div>
              <div className="profile-info">
                <div className="profile-username-row"><h3 className="profile-username">english_learner</h3></div>
                <div className="profile-stats-row">
                  <div className="profile-stat-item"><span className="profile-stat-num">{progress.totalSessions}</span> sessions</div>
                  <div className="profile-stat-item"><span className="profile-stat-num">{progress.streak}🔥</span> streak</div>
                  <div className="profile-stat-item"><span className="profile-stat-num">{progress.accuracy}%</span> accuracy</div>
                </div>
                <div className="profile-bio">
                  <span className="profile-bio-name">English Speaking Mentee</span>
                  <p className="profile-bio-text">🌱 Building fluency one conversation at a time.<br/>📚 Vocabulary introduced: {progress.totalVocab} ({progress.vocabThisWeek} this week).</p>
                </div>
              </div>
            </div>
            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon-wrap"><Award size={32}/></div>
                <h2>No Sessions Yet</h2>
                <p>Start practicing to generate progress stats and session cards.</p>
              </div>
            ) : (
              <div className="posts-grid">
                {sessions.map(session => {
                  const dateObj = new Date(session.date);
                  const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  let icon = "💬";
                  if (session.scenario === 'Job Interview') icon = "💼";
                  if (session.scenario === 'Ordering at a Cafe') icon = "☕";
                  return (
                    <div key={session.id} className="post-card" onClick={() => setSelectedSession(session)}>
                      <div className="post-icon">{icon}</div>
                      <span className="post-card-scenario">
                        {session.scenario === 'Casual Conversation' ? 'Free Chat' : session.scenario === 'Job Interview' ? 'Interview' : 'Cafe'}
                      </span>
                      <span className="post-date">{formattedDate}</span>
                      <div className="post-hover-overlay">
                        <div className="post-hover-stat"><BookOpen size={14}/> {session.feedback?.vocabulary?.length || 0} Vocab</div>
                        <div className="post-hover-stat"><AlertCircle size={14}/> {session.feedback?.corrections?.length || 0} Edits</div>
                        <div className="post-hover-detail">Click to view</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <header className="post-detail-header">
              <h3>Settings</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}><X size={18}/></button>
            </header>
            <div className="settings-form">
              <div className="form-group">
                <label className="form-label">Gemini API Key</label>
                <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="Paste your Gemini API key here..." className="form-input"/>
                <span className="form-hint">Stored locally. Never shared.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="form-input" style={{background:'var(--bg-deep-black)'}}>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Accurate)</option>
                </select>
              </div>
              {voices.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Voice</label>
                  <select value={selectedVoiceName} onChange={e => { setSelectedVoiceName(e.target.value); localStorage.setItem('speech_voice', e.target.value); }} className="form-input" style={{background:'var(--bg-deep-black)'}}>
                    {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Speaking Speed: {speechSpeed}x</label>
                <input type="range" min="0.7" max="1.3" step="0.05" value={speechSpeed} onChange={e => setSpeechSpeed(parseFloat(e.target.value))} style={{accentColor:'#e6683c'}}/>
              </div>
              <button className="btn-primary" onClick={handleSaveSettings}>Save & Close</button>
              <button className="btn-danger" onClick={handleClearHistory}>Reset All Data</button>
            </div>
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="post-detail-overlay" onClick={() => setSelectedSession(null)}>
          <div className="post-detail-modal" onClick={e => e.stopPropagation()}>
            <header className="post-detail-header">
              <div>
                <h3>{selectedSession.scenario === 'Casual Conversation' ? 'Free Chat' : selectedSession.scenario} Practice</h3>
                <span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{new Date(selectedSession.date).toLocaleString()}</span>
              </div>
              <button className="close-btn" onClick={() => setSelectedSession(null)}><X size={20}/></button>
            </header>
            <div className="post-detail-content">
              <div>
                <span className="post-detail-section-title"><Calendar size={12}/> Your Turn</span>
                <p className="transcript-quote">"{selectedSession.transcript}"</p>
              </div>
              <div>
                <span className="post-detail-section-title">💬 AI Response</span>
                <p style={{fontSize:'0.9rem', lineHeight:'1.5'}}>"{selectedSession.feedback?.spokenResponse}"</p>
              </div>
              {selectedSession.feedback?.corrections?.length ? (
                <div>
                  <span className="post-detail-section-title errors"><AlertCircle size={12}/> Corrections</span>
                  <ul className="correction-list">{selectedSession.feedback.corrections.map((c,i) => <li key={i} className="correction-item">{c}</li>)}</ul>
                </div>
              ) : null}
              {selectedSession.feedback?.vocabulary?.length ? (
                <div>
                  <span className="post-detail-section-title vocab"><BookOpen size={12}/> Vocabulary</span>
                  <div className="vocab-grid">
                    {selectedSession.feedback.vocabulary.map((v,i) => (
                      <div key={i} className="vocab-card">
                        <div className="vocab-word">{v.word}</div>
                        <div className="vocab-def">{v.def}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
