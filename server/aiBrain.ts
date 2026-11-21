import { ThinkingLevel, Type } from '@google/genai';
import { getGeminiClient } from './geminiClient.ts';
import type { GameplayEventType } from '../src/types.ts';

export interface FrameAnalysisInput {
  frameBase64: string;
  mimeType?: string;
  videoTimeSec: number;
  humorLevel: 'low' | 'medium' | 'high';
  commentarySpeed: number;
  recentLines: string[];
  forceSpeak?: boolean;
}

export interface FrameAnalysisOutput {
  eventType: GameplayEventType;
  intensity: number;
  emotion: 'excited' | 'funny' | 'tense' | 'chill';
  sceneSummary: string;
  commentaryRoman: string;
  commentaryUrdu: string;
  shouldSpeak: boolean;
  latencyMs: number;
}

export async function analyzeGameplayFrame(
  input: FrameAnalysisInput
): Promise<FrameAnalysisOutput> {
  const ai = getGeminiClient();
  const startedAt = Date.now();

  const cleanBase64 = input.frameBase64.replace(/^data:image\/\w+;base64,/, '');

  const humorInstruction =
    input.humorLevel === 'high'
      ? 'Use witty Pakistani desi gamer humor, playful banter, and funny reactions while staying relevant to what is on screen.'
      : input.humorLevel === 'medium'
        ? 'Balance hype gaming commentary with light, natural Pakistani humor.'
        : 'Keep commentary focused, hype, and crisp with minimal jokes.';

  const lengthGuidance =
    input.commentarySpeed >= 1.1
      ? 'Keep the line punchy and energetic (10 to 16 words).'
      : 'Keep the line natural and conversational (14 to 22 words).';

  const recentContext =
    input.recentLines.length > 0
      ? `Avoid repeating phrases, openers, or ideas from these recent lines:\n- ${input.recentLines.join('\n- ')}`
      : 'This is the opening reaction of the stream.';

  const systemInstruction = `You are a charismatic Pakistani male GTA 6 gaming live streamer hosting a stream in natural conversational Urdu.
Your style:
- Speak authentic Pakistani Urdu (Lahori/Karachi casual gaming vibe) mixed naturally with common English gaming words (like drift, nitro, police chase, clutch, mission, headshot, spawn, map, graphics, car).
- Never use stiff textbook translation Urdu. Use natural gamer expressions like "O bhai sahab", "Scene check karo yaar", "Full tight drift", "Police peeche par gayi", "Kya baat hai", "Bach gaye guru".
- ${humorInstruction}
- ${lengthGuidance}
- Observe the actual image frame carefully: describe or react specifically to the cars, road, sunset, police lights, HUD, characters, crashes, or surroundings visible right now.
- ${recentContext}
- Output both commentaryRoman (natural Roman Urdu) and commentaryUrdu (clean, properly spelled Pakistani Urdu script for subtitle display and Urdu TTS pronunciation; keep English gaming words in Urdu-readable or crisp Latin form sparingly where natural).`;

  const prompt = `Analyze this gameplay frame at timestamp ${input.videoTimeSec.toFixed(1)}s.
${input.forceSpeak ? 'The host requested an immediate reaction (shouldSpeak MUST be true).' : 'Set shouldSpeak to true if there is meaningful action, visual change, or storytelling opportunity; set false only if the screen is completely static or blank.'}`;

  const contentsPayload = {
    parts: [
      {
        inlineData: {
          mimeType: input.mimeType || 'image/jpeg',
          data: cleanBase64,
        },
      },
      { text: prompt },
    ],
  };

  const schemaConfig = {
    type: Type.OBJECT,
    properties: {
      eventType: {
        type: Type.STRING,
        description:
          'One of: driving, police_chase, crash, combat, mission, comedy, exploration',
      },
      intensity: {
        type: Type.INTEGER,
        description: 'Action intensity from 1 to 10',
      },
      emotion: {
        type: Type.STRING,
        description: 'One of: excited, funny, tense, chill',
      },
      sceneSummary: {
        type: Type.STRING,
        description: 'Concise 1-sentence English summary of what is visible in the frame',
      },
      commentaryRoman: {
        type: Type.STRING,
        description: 'Natural Pakistani Urdu gamer commentary in Roman Urdu',
      },
      commentaryUrdu: {
        type: Type.STRING,
        description: 'Same commentary in clean Pakistani Urdu script (اردو)',
      },
      shouldSpeak: {
        type: Type.BOOLEAN,
        description: 'Whether the AI host should speak this line aloud now',
      },
    },
    required: [
      'eventType',
      'intensity',
      'emotion',
      'sceneSummary',
      'commentaryRoman',
      'commentaryUrdu',
      'shouldSpeak',
    ],
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: contentsPayload,
      config: {
        httpOptions: { timeout: 15000 },
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: schemaConfig,
      },
    });
  } catch (primaryErr) {
    const errText = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    if (
      errText.includes('503') ||
      errText.includes('504') ||
      errText.includes('429') ||
      errText.includes('UNAVAILABLE') ||
      errText.includes('DEADLINE_EXCEEDED') ||
      errText.includes('AbortError')
    ) {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: contentsPayload,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: schemaConfig,
        },
      });
    } else {
      throw primaryErr;
    }
  }

  const rawText = (response.text || '{}').trim();
  const parsed = JSON.parse(rawText) as Omit<FrameAnalysisOutput, 'latencyMs'>;

  const validEvents: GameplayEventType[] = [
    'driving',
    'police_chase',
    'crash',
    'combat',
    'mission',
    'comedy',
    'exploration',
  ];
  const eventType = validEvents.includes(parsed.eventType) ? parsed.eventType : 'driving';

  const validEmotions = ['excited', 'funny', 'tense', 'chill'] as const;
  const emotion = validEmotions.includes(parsed.emotion) ? parsed.emotion : 'excited';

  return {
    eventType,
    intensity: Math.max(1, Math.min(10, Number(parsed.intensity) || 6)),
    emotion,
    sceneSummary: parsed.sceneSummary || 'Gameplay frame analyzed',
    commentaryRoman: parsed.commentaryRoman || 'O bhai scene check karo!',
    commentaryUrdu: parsed.commentaryUrdu || 'او بھائی سین چیک کرو!',
    shouldSpeak: input.forceSpeak ? true : Boolean(parsed.shouldSpeak),
    latencyMs: Date.now() - startedAt,
  };
}
