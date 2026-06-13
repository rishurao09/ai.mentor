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
  Send
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

const VAD_TIMEOUT_MS = 2500; // 2.5s of silence auto-submits

function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'profile'>('chat');
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

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [speechSpeed, setSpeechSpeed] = useState(0.95);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  
  // Progress & Profile Logs
  const [progress, setProgress] = useState(getProgress());
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<PracticeSession | null>(null);

  // Likes & Heart animations
  const [likedMessages, setLikedMessages] = useState<Record<string, boolean>>({});
  const [heartAnims, setHeartAnims] = useState<Record<string, boolean>>({});

  // Refs
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const latestTranscriptRef = useRef('');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, transcript, activeTab]);

  useEffect(() => {
    // Populate sessions on load
    setSessions(getSessions());
    setApiKeyInput(getApiKey());
    setSelectedModel(getModel());
    const storedSpeed = localStorage.getItem('speech_speed');
    if (storedSpeed) setSpeechSpeed(parseFloat(storedSpeed));

    // Handle SpeechSynthesis voices
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const enVoices = allVoices.filter(v => v.lang.startsWith('en-') || v.lang.startsWith('en_'));
      setVoices(enVoices);
      
      const storedVoiceName = localStorage.getItem('speech_voice');
      if (storedVoiceName && enVoices.some(v => v.name === storedVoiceName)) {
        setSelectedVoiceName(storedVoiceName);
      } else {
        // Find best English voice default
        const bestVoice = enVoices.find(v => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft David')) || enVoices[0];
        if (bestVoice) {
          setSelectedVoiceName(bestVoice.name);
          localStorage.setItem('speech_voice', bestVoice.name);
        }
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      window.speechSynthesis.cancel();
      clearSilenceTimeout();
    };
  }, []);

  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const speak = async (text: string) => {
    stopSpeaking(); 
    
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Choose selected or best voice
    const allVoices = synth.getVoices();
    const englishVoice = allVoices.find(v => v.name === selectedVoiceName) || 
                         allVoices.find(v => v.lang.startsWith('en-') && (v.name.includes('Natural') || v.name.includes('Google'))) || 
                         allVoices.find(v => v.lang.startsWith('en-'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    
    utterance.rate = speechSpeed;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synth.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

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
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: result.spokenResponse,
        corrections: result.corrections,
        vocabulary: result.vocabulary
      };
      
      setConversation(prev => [...prev, aiResponseTurn]);
      await speak(result.spokenResponse);
      
      saveSession({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        scenario: activeScenarioRef.current,
        transcript: finalTranscript,
        feedback: result
      });
      
      // Update statistics
      setProgress(getProgress());
      setSessions(getSessions());
    } catch (error: any) {
      console.error(error);
      const isApiKeyErr = error.message?.includes('API key') || error.message?.includes('key') || error.message?.includes('400');
      const errMessageText = isApiKeyErr
        ? "Google Gemini API Key is missing or invalid. Please click 'Settings' (in the top right or sidebar), paste a valid API key, and click Save to start speaking!"
        : `Sorry, I had trouble connecting: ${error.message || 'Unknown network error'}. Please check your connection or try again.`;
      
      const aiErrorTurn: ConversationTurn = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: errMessageText
      };
      setConversation(prev => [...prev, aiErrorTurn]);
      await speak(errMessageText);
    } finally {
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechSpeed]);

  const handleSendText = () => {
    if (isSpeaking) stopSpeaking();
    if (textInput.trim()) {
      processFeedback(textInput.trim());
      setTextInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleSendText();
    }
  }; 

  // Initial greeting
  useEffect(() => {
    setTimeout(() => {
      greetUser(SCENARIOS[0].id);
    }, 500);
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

  const toggleRecording = () => {
    if (isSpeaking) stopSpeaking();

    if (isRecording) {
      clearSilenceTimeout();
      const currentText = latestTranscriptRef.current || transcript;
      if (currentText.trim().length > 1) {
        processFeedback(currentText);
      } else {
        setIsRecording(false);
        try {
          recognitionRef.current?.stop();
        } catch (e) {}
      }
    } else {
      setIsRecording(true);
      setTranscript('');
      latestTranscriptRef.current = '';

      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        setConversation(prev => [...prev, {
          id: Date.now().toString(),
          role: 'ai',
          text: "Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge."
        }]);
        setIsRecording(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
        latestTranscriptRef.current = currentTranscript;

        clearSilenceTimeout();
        if (currentTranscript.trim().length > 0) {
          silenceTimeoutRef.current = setTimeout(() => {
            if (latestTranscriptRef.current.length > 2) {
              processFeedback(latestTranscriptRef.current);
            }
          }, VAD_TIMEOUT_MS);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        clearSilenceTimeout();
        
        if (event.error === 'not-allowed') {
          setConversation(prev => [...prev, {
            id: Date.now().toString(),
            role: 'ai',
            text: "Microphone access is blocked. Please check your browser's address bar (click the camera/microphone lock icon or permission settings) to allow microphone access, then try again."
          }]);
        } else if (event.error === 'no-speech') {
          console.warn("No speech detected.");
        } else {
          setConversation(prev => [...prev, {
            id: Date.now().toString(),
            role: 'ai',
            text: `Speech recognition error: ${event.error}. Please try again.`
          }]);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        setIsRecording(false);
      }
    }
  };

  const handleSaveSettings = () => {
    saveApiKey(apiKeyInput);
    saveModel(selectedModel);
    localStorage.setItem('speech_speed', speechSpeed.toString());
    setShowSettings(false);
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to delete all practice history? This resets your statistics.")) {
      clearSessions();
      setSessions([]);
      setProgress(getProgress());
      setShowSettings(false);
    }
  };

  const handleMessageLike = (messageId: string) => {
    const isLiked = likedMessages[messageId];
    setLikedMessages(prev => ({ ...prev, [messageId]: !isLiked }));
    
    if (!isLiked) {
      // Pop heart animation
      setHeartAnims(prev => ({ ...prev, [messageId]: true }));
      setTimeout(() => {
        setHeartAnims(prev => ({ ...prev, [messageId]: false }));
      }, 700);
    }
  };

  return (
    <div className="app-container">
      {/* ─── Sidebar Navigation (Desktop) ─── */}
      <aside className="sidebar">
        <div className="logo-container">
          <h2 className="brand-logo">Mentor.ai</h2>
          <nav className="nav-links">
            <button 
              className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <div className="nav-icon-box">
                <Home size={18} />
              </div>
              PRACTICE
            </button>
            <button 
              className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <div className="nav-icon-box">
                <User size={18} />
              </div>
              PROFILE
            </button>
          </nav>
        </div>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => {
            setApiKeyInput(getApiKey());
            setSelectedModel(getModel());
            setShowSettings(true);
          }}>
            <div className="nav-icon-box">
              <Settings size={18} />
            </div>
            SETTINGS
          </button>
        </div>
      </aside>

      {/* ─── Mobile Bottom Navigation ─── */}
      <nav className="mobile-nav">
        <button 
          className={`mobile-nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <Home size={20} />
          PRACTICE
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={20} />
          PROFILE
        </button>
        <button className="mobile-nav-btn" onClick={() => {
          setApiKeyInput(getApiKey());
          setSelectedModel(getModel());
          setShowSettings(true);
        }}>
          <Settings size={20} />
          SETTINGS
        </button>
      </nav>

      {/* ─── Main Display Panel ─── */}
      <main className="main-content">
        
        {/* Chat tab */}
        {activeTab === 'chat' && (
          <>
            <header className="top-nav">
              <span className="top-nav-title">English Mentoring</span>
              <div className="top-nav-actions">
                <button className="btn-secondary" onClick={() => {
                  setApiKeyInput(getApiKey());
                  setSelectedModel(getModel());
                  setShowSettings(true);
                }}>
                  <Settings size={14} /> SETTINGS
                </button>
              </div>
            </header>

            {/* Scenarios - Sleek Horizontal Tabs */}
            <div className="scenarios-tabs-bar">
              {SCENARIOS.map(scenario => {
                const isActive = activeScenario === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    className={`scenario-tab-btn ${isActive ? 'active' : ''}`}
                    onClick={() => handleScenarioChange(scenario.id)}
                    disabled={isRecording || isProcessing || isSpeaking}
                  >
                    {scenario.iconName === 'MessageSquare' && <MessageSquare size={16} />}
                    {scenario.iconName === 'Briefcase' && <Briefcase size={16} />}
                    {scenario.iconName === 'Coffee' && <Coffee size={16} />}
                    <span>{scenario.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Two-column layout grid */}
            <div className="chat-layout-wrapper">
              <div className="chat-feed-column">
                <div className="chat-container">
                  {conversation.length <= 1 && (
                    <div className="chat-suggestions-container">
                      <span className="suggestions-title">Tap a prompt to start practicing:</span>
                      <div className="suggestions-grid">
                        <button 
                          className="suggestion-chip"
                          onClick={() => setTextInput("Let's talk about my favorite hobbies.")}
                        >
                          💬 Discuss Hobbies
                        </button>
                        <button 
                          className="suggestion-chip"
                          onClick={() => setTextInput("Can you ask me common job interview questions?")}
                        >
                          💼 Job Interview Practice
                        </button>
                        <button 
                          className="suggestion-chip"
                          onClick={() => setTextInput("I want to practice ordering a hot coffee and croissant.")}
                        >
                          ☕ Cafe Roleplay Chat
                        </button>
                      </div>
                    </div>
                  )}
                  {conversation.map(turn => (
                    <div key={turn.id} className={`chat-message ${turn.role}`}>
                      <div 
                        className="chat-bubble-container"
                        onDoubleClick={() => turn.role === 'ai' && handleMessageLike(turn.id)}
                      >
                        <div className="chat-bubble">
                          {turn.text}
                          {likedMessages[turn.id] && (
                            <div className="bubble-liked-indicator" onClick={() => handleMessageLike(turn.id)}>
                              <Heart size={10} fill="currentColor" />
                            </div>
                          )}
                        </div>
                        {/* Floating Heart Pop Animation */}
                        {heartAnims[turn.id] && (
                          <div className="heart-pop animate">
                            <Heart size={44} fill="currentColor" />
                          </div>
                        )}
                      </div>

                      {/* Corrections & Vocab specific card */}
                      {turn.role === 'ai' && (turn.corrections?.length || turn.vocabulary?.length) ? (
                        <div className="corrections-panel">
                          {turn.corrections && turn.corrections.length > 0 && (
                            <div className="feedback-section-box">
                              <h4 className="corrections-section-title errors">
                                <AlertCircle size={13} /> MENTOR FEEDBACK
                              </h4>
                              <div className="corrections-content-card">
                                <ul className="correction-list">
                                  {turn.corrections.map((c, idx) => (
                                    <li key={idx} className="correction-item">{c}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {turn.vocabulary && turn.vocabulary.length > 0 && (
                            <div className="feedback-section-box">
                              <h4 className="corrections-section-title vocab">
                                <BookOpen size={13} /> VOCABULARY SUGGESTION
                              </h4>
                              <div className="corrections-content-card">
                                <div className="vocab-grid">
                                  {turn.vocabulary.map((v, idx) => (
                                    <div key={idx} className="vocab-row">
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

                  {/* Ghost Bubble (Listening text) */}
                  {(isRecording || transcript) && (
                    <div className="chat-message user">
                      <div className="chat-bubble" style={{ opacity: transcript ? 1 : 0.55 }}>
                        {transcript || "Listening..."}
                      </div>
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>
              </div>


            </div>

            {/* Redesigned Human-Centered Input Bar */}
            <div className="control-area">
              <div className="input-row-container">
                <div className="text-input-bar">
                  <input 
                    type="text" 
                    placeholder={isRecording ? "Listening to your voice..." : "Type your message..."}
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isProcessing}
                    className="chat-text-input"
                  />
                  
                  <button 
                    className={`mic-trigger-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleRecording}
                    disabled={isProcessing}
                    title="Speak your response"
                  >
                    <Mic size={18} />
                  </button>
                </div>

                <button 
                  className="send-trigger-btn"
                  onClick={handleSendText}
                  disabled={isProcessing || (!textInput.trim() && !isRecording)}
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              </div>

              {/* Minimal Helper Status Text */}
              <div className="status-text">
                {isProcessing ? (
                  'Mentor is listening carefully...'
                ) : isSpeaking ? (
                  <div className="speaking-indicator" onClick={stopSpeaking} style={{ cursor: 'pointer' }} title="Click to stop speaking">
                    Mentor speaking (tap to stop) <div className="speaking-bar"/><div className="speaking-bar"/><div className="speaking-bar"/>
                  </div>
                ) : (
                  'Double-tap any AI message to like it'
                )}
              </div>
            </div> {/* Closed control-area */}
          </>
        )}

        {/* Profile / Progress Dashboard */}
        {activeTab === 'profile' && (
          <div className="profile-container">
            <div className="profile-header">
              <div className="profile-avatar-container">
                <div className="profile-avatar">
                  <div className="profile-avatar-inner">
                    EL
                  </div>
                </div>
              </div>
              <div className="profile-info">
                <div className="profile-username-row">
                  <h3 className="profile-username">english_learner</h3>
                </div>
                <div className="profile-stats-row">
                  <div className="profile-stat-item">
                    <span className="profile-stat-num">{progress.totalSessions}</span> sessions
                  </div>
                  <div className="profile-stat-item">
                    <span className="profile-stat-num">{progress.streak}🔥</span> daily streak
                  </div>
                  <div className="profile-stat-item">
                    <span className="profile-stat-num">{progress.accuracy}%</span> accuracy
                  </div>
                </div>
                <div className="profile-bio">
                  <span className="profile-bio-name">English speaking Mentee</span>
                  <p className="profile-bio-text">
                    🌱 Patiently practicing English conversation and interviews.<br />
                    📚 Total vocabulary words introduced: {progress.totalVocab} ({progress.vocabThisWeek} this week).
                  </p>
                </div>
              </div>
            </div>

            {/* Instagram Style grid of logs */}
            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon-wrap">
                  <Award size={32} />
                </div>
                <h2>No Sessions Yet</h2>
                <p>Start practicing conversations to generate progress stats and session cards.</p>
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
                    <div 
                      key={session.id} 
                      className="post-card"
                      onClick={() => setSelectedSession(session)}
                    >
                      <div className="post-icon">{icon}</div>
                      <span className="post-card-scenario">
                        {session.scenario === 'Casual Conversation' ? 'Free Chat' : 
                         session.scenario === 'Job Interview' ? 'Interview' : 'Cafe'}
                      </span>
                      <span className="post-date">{formattedDate}</span>
                      
                      <div className="post-hover-overlay">
                        <div className="post-hover-stat">
                          <BookOpen size={14} /> {session.feedback?.vocabulary?.length || 0} Vocab
                        </div>
                        <div className="post-hover-stat">
                          <AlertCircle size={14} /> {session.feedback?.corrections?.length || 0} Edits
                        </div>
                        <div className="post-hover-detail">Click to view details</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Settings Overlay Modal ─── */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <header className="post-detail-header">
              <h3>Settings</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>
                <X size={18} />
              </button>
            </header>
            
            <div className="settings-form">
              <div className="form-group">
                <label className="form-label">Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="Paste your Gemini API key here..."
                  className="form-input"
                />
                <span className="form-hint">Stored locally on your browser. Never shared.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Model Selection</label>
                <select 
                  value={selectedModel} 
                  onChange={e => setSelectedModel(e.target.value)}
                  className="form-input"
                  style={{ background: 'var(--bg-black)' }}
                >
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast, Low Tokens)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Ultra Fast, High Accuracy)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Mentor Voice Selection</label>
                {voices.length === 0 ? (
                  <div className="form-hint" style={{ color: 'var(--text-muted)' }}>
                    No English system voices detected. Defaulting to system speech voice.
                  </div>
                ) : (
                  <select 
                    value={selectedVoiceName} 
                    onChange={e => {
                      setSelectedVoiceName(e.target.value);
                      localStorage.setItem('speech_voice', e.target.value);
                      const synth = window.speechSynthesis;
                      synth.cancel();
                      const utterance = new SpeechSynthesisUtterance("Hello! I am your English speaking mentor.");
                      const voice = synth.getVoices().find(v => v.name === e.target.value);
                      if (voice) utterance.voice = voice;
                      utterance.rate = speechSpeed;
                      synth.speak(utterance);
                    }}
                    className="form-input"
                    style={{ background: 'var(--bg-black)' }}
                  >
                    {voices.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                )}
                <span className="form-hint">Choose a voice from your system. Google/Natural/Edge online voices sound best.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Mentor Speaking Speed: {speechSpeed}x</label>
                <input 
                  type="range" 
                  min="0.7" 
                  max="1.3" 
                  step="0.05"
                  value={speechSpeed}
                  onChange={e => setSpeechSpeed(parseFloat(e.target.value))}
                  style={{ accentColor: 'var(--instagram-blue)' }}
                />
              </div>

              <button className="btn-primary" onClick={handleSaveSettings}>
                Save & Close
              </button>

              <button className="btn-danger" onClick={handleClearHistory}>
                Reset All Practice Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Session Details Modal (Instagram Detail Style) ─── */}
      {selectedSession && (
        <div className="post-detail-overlay" onClick={() => setSelectedSession(null)}>
          <div className="post-detail-modal" onClick={e => e.stopPropagation()}>
            <header className="post-detail-header">
              <div>
                <h3 style={{ textTransform: 'capitalize' }}>
                  {selectedSession.scenario === 'Casual Conversation' ? 'Free Chat' : selectedSession.scenario} Practice
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {new Date(selectedSession.date).toLocaleString()}
                </span>
              </div>
              <button className="close-btn" onClick={() => setSelectedSession(null)}>
                <X size={20} />
              </button>
            </header>

            <div className="post-detail-content">
              <div>
                <span className="post-detail-section-title">
                  <Calendar size={12} /> User Spoken Turn
                </span>
                <p className="transcript-quote">
                  "{selectedSession.transcript}"
                </p>
              </div>

              <div>
                <span className="post-detail-section-title">
                  💬 AI Response
                </span>
                <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                  "{selectedSession.feedback?.spokenResponse}"
                </p>
              </div>

              {selectedSession.feedback?.corrections && selectedSession.feedback.corrections.length > 0 && (
                <div>
                  <span className="post-detail-section-title errors">
                    <AlertCircle size={12} /> Corrected Grammar & Phrases
                  </span>
                  <ul className="correction-list" style={{ marginTop: '0.4rem' }}>
                    {selectedSession.feedback.corrections.map((corr, i) => (
                      <li key={i} className="correction-item">{corr}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedSession.feedback?.vocabulary && selectedSession.feedback.vocabulary.length > 0 && (
                <div>
                  <span className="post-detail-section-title vocab">
                    <BookOpen size={12} /> Words & Idioms Introduced
                  </span>
                  <div className="vocab-grid" style={{ marginTop: '0.4rem' }}>
                    {selectedSession.feedback.vocabulary.map((vocab, i) => (
                      <div key={i} className="vocab-card">
                        <div className="vocab-word">{vocab.word}</div>
                        <div className="vocab-def">{vocab.def}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
