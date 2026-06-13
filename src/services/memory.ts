export interface Vocabulary {
  word: string;
  def: string;
}

export interface PracticeSession {
  id: string;
  date: string;
  scenario: string;
  transcript: string;
  feedback: {
    spokenResponse: string;
    corrections: string[];
    vocabulary: Vocabulary[];
  };
}

export const getSessions = (): PracticeSession[] => {
  const data = localStorage.getItem('english_mentor_sessions');
  return data ? JSON.parse(data) : [];
};

export const saveSession = (session: PracticeSession) => {
  const sessions = getSessions();
  sessions.push(session);
  localStorage.setItem('english_mentor_sessions', JSON.stringify(sessions));
};

export const clearSessions = () => {
  localStorage.removeItem('english_mentor_sessions');
};

export const getProgress = () => {
  const sessions = getSessions();
  const totalVocab = sessions.reduce((acc, session) => acc + (session.feedback?.vocabulary?.length || 0), 0);
  
  // Calculate vocab learned this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const vocabThisWeek = sessions
    .filter(s => new Date(s.date) >= oneWeekAgo)
    .reduce((acc, session) => acc + (session.feedback?.vocabulary?.length || 0), 0);
    
  // Calculate average accuracy score based on number of corrections
  const totalCorrections = sessions.reduce((acc, session) => acc + (session.feedback?.corrections?.length || 0), 0);
  const totalTurns = sessions.length;
  // Baseline is 100. Deduct 12% per correction, max deduction down to 55% to keep it encouraging.
  const accuracy = totalTurns > 0 
    ? Math.max(55, Math.min(100, Math.round(100 - (totalCorrections / totalTurns) * 12))) 
    : 100;

  // Calculate practice streak
  const dates = sessions.map(s => s.date.split('T')[0]);
  const uniqueDates = Array.from(new Set(dates)).sort().reverse();
  let streak = 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (uniqueDates.includes(todayStr) || uniqueDates.includes(yesterdayStr)) {
    let currentCheck = new Date();
    while (true) {
      const checkStr = currentCheck.toISOString().split('T')[0];
      if (uniqueDates.includes(checkStr)) {
        streak++;
        currentCheck.setDate(currentCheck.getDate() - 1);
      } else {
        break;
      }
    }
  }
    
  return {
    totalVocab,
    vocabThisWeek,
    totalSessions: sessions.length,
    accuracy,
    streak
  };
};

export const getApiKey = (): string => {
  const geminiKey = localStorage.getItem('gemini_api_key') || '';
  if (geminiKey) return geminiKey;
  
  const openaiKey = localStorage.getItem('openai_api_key') || '';
  if (openaiKey && !openaiKey.startsWith('sk-')) {
    return openaiKey;
  }
  return '';
};

export const saveApiKey = (key: string) => {
  localStorage.setItem('gemini_api_key', key);
};

export const getModel = (): string => {
  return localStorage.getItem('gemini_model') || 'gemini-1.5-flash';
};

export const saveModel = (model: string) => {
  localStorage.setItem('gemini_model', model);
};

