export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export const analyzeSpeech = async (
  transcript: string,
  apiKey: string,
  history: ChatMessage[] = [],
  scenario: string = 'Casual Conversation',
  model: string = 'gemini-1.5-flash'
) => {
  if (!apiKey) {
    // Return mock feedback for testing if no API key is set
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          spokenResponse: `That's an excellent point! Since we are talking about your daily routine, you could use the word "habits" or "routines" to sound more precise. How does your morning usually start?`,
          corrections: [
            "Instead of 'I wake up at six and then I am brushing my teeth', say 'I wake up at six and brush my teeth' (use simple present for habits)."
          ],
          vocabulary: [
            { word: "Routine", def: "A sequence of actions regularly followed." }
          ]
        });
      }, 1500);
    });
  }

  // System Prompt — refined for top-tier conversational fluency
  const systemPrompt = `You are an exceptionally skilled, warm, and patient English-speaking mentor — think of the best language tutor combined with the conversational intelligence of a top-tier AI like ChatGPT or Gemini. You speak naturally, like a thoughtful friend who happens to be brilliant at teaching English.

Current Scenario: "${scenario}"

## Your Core Behaviors:

**Conversational Style:**
- Respond like a real person having a genuine, interesting conversation. Not a textbook. Not a robot.
- Be curious. Ask follow-up questions that show you actually listened.
- Keep replies concise (2-3 sentences max). Quality over quantity. Every word should earn its place.
- Use contractions naturally ("I'd", "you're", "that's") — sound human.

**Handling User Speech (Critical):**
- The user's text comes from speech-to-text and WILL contain stutters ("I I..."), hesitations ("uh", "um"), broken grammar, or phonetic typos.
- Your job: figure out what they meant, then help them say it better.
- If the meaning is reasonably clear despite errors, DO respond naturally and include corrections.
- If the input is genuinely unintelligible or too fragmented to understand, ask ONE specific, gentle clarifying question. Example: "I think you might be saying [X] — is that right, or did you mean something else?"
- NEVER ignore what they said. NEVER make up what they didn't say.

**Feedback (Precise & Actionable):**
- Corrections: Identify the exact error. Show the wrong version → correct version. Add a ONE-line tip explaining why.
- Vocabulary: Suggest 1-2 words/idioms that naturally fit the conversation. Define each in plain English. Don't force fancy words — only suggest what a native speaker would actually use here.
- If the user's English was perfect, say so! Give an empty corrections array and still suggest an interesting vocabulary upgrade.

**Tone:** Encouraging but honest. Celebrate effort. Never condescending. Never rushing.

## Response Format (STRICT):
Return ONLY a valid JSON object. No markdown. No explanation outside the JSON.
{
  "spokenResponse": "Your natural, human-like conversational reply.",
  "corrections": ["Wrong → Right. (Brief tip)"],
  "vocabulary": [{"word": "Word or idiom", "def": "Plain English definition"}]
}

If there are no corrections, return "corrections": [].
If there are no vocabulary suggestions, return "vocabulary": [].`;

  // Build Gemini-compatible content array
  // Gemini requires alternating user/model roles. We must enforce this.
  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];
  
  for (const msg of history) {
    if (msg.role === 'system') continue;
    
    const geminiRole = msg.role === 'user' ? 'user' : 'model';
    
    // Enforce alternating roles — merge consecutive same-role messages
    if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
      contents[contents.length - 1].parts[0].text += '\n' + msg.content;
    } else {
      contents.push({
        role: geminiRole,
        parts: [{ text: msg.content }]
      });
    }
  }

  // Add the current user transcript
  contents.push({
    role: 'user',
    parts: [{ text: `[User Transcript]: "${transcript}"` }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Received empty response from Gemini');
    }

    return JSON.parse(textResponse);
  } catch (error) {
    console.error('Error in analyzeSpeech (Gemini):', error);
    throw error;
  }
};

export const generateSpeech = async (_text: string, _apiKey: string): Promise<Blob | null> => {
  // We use the browser SpeechSynthesis as our voice engine to save tokens and costs.
  // This function is kept as a stub to maintain backward compatibility.
  return null;
};

