import fs from 'fs';
import path from 'path';
import { getGeminiClient } from './geminiClient.ts';
import { TTS_DIR } from './media.ts';
import type { TtsModelId, VoicePersonaId } from '../src/types.ts';

export interface TtsGenerateInput {
  id: string;
  textUrdu: string;
  emotion: 'excited' | 'funny' | 'tense' | 'chill';
  voiceId: VoicePersonaId;
  ttsModel: TtsModelId;
  speed: number;
}

export interface TtsGenerateOutput {
  audioUrl: string;
  audioPath: string;
  audioBase64: string;
  audioMimeType: string;
}

function buildPakistaniUrduStylePrompt(
  emotion: TtsGenerateInput['emotion'],
  voiceId: VoicePersonaId,
  speed: number
): string {
  const personaTone =
    voiceId === 'Fenrir'
      ? 'Deep, bold Pakistani male gaming streamer voice from Karachi'
      : voiceId === 'Charon'
        ? 'Warm, witty Pakistani male gaming host voice from Lahore'
        : 'Energetic, fast-talking young Pakistani male YouTube gamer voice';

  const emotionTone =
    emotion === 'excited'
      ? 'excited, hyped reaction during intense gameplay action'
      : emotion === 'funny'
        ? 'amused, playful laughing gamer delivery'
        : emotion === 'tense'
          ? 'focused, suspenseful high-stakes chase energy'
          : 'relaxed, conversational friendly hangout tone';

  const paceNote =
    speed >= 1.12
      ? 'slightly brisk, lively pace'
      : speed <= 0.92
        ? 'measured, relaxed pace'
        : 'natural conversational pace';

  return `${personaTone} speaking authentic Pakistani Urdu with casual gamer slang and natural pauses, ${emotionTone}, ${paceNote}. Strictly Pakistani Urdu pronunciation, never American or robotic accent.`;
}

export async function generatePakistaniUrduSpeech(
  input: TtsGenerateInput
): Promise<TtsGenerateOutput> {
  const ai = getGeminiClient();
  const style = buildPakistaniUrduStylePrompt(input.emotion, input.voiceId, input.speed);

  const response = await ai.models.generateContent({
    model: input.ttsModel,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: input.textUrdu,
            speechMetadata: {
              style,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: input.voiceId,
          },
        },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p) => Boolean(p.inlineData?.data)
  );
  const base64Audio = audioPart?.inlineData?.data;
  const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

  if (!base64Audio) {
    throw new Error('Gemini TTS returned no audio data for this commentary segment.');
  }

  const wavBuffer = Buffer.from(base64Audio, 'base64');
  const filename = `urdu-${input.id}.wav`;
  const audioPath = path.join(TTS_DIR, filename);
  fs.writeFileSync(audioPath, wavBuffer);

  // Prune old TTS files beyond the latest 40 clips to stay lightweight on free-tier disks
  try {
    const files = fs
      .readdirSync(TTS_DIR)
      .filter((f) => f.endsWith('.wav'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(TTS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const stale of files.slice(40)) {
      fs.unlinkSync(path.join(TTS_DIR, stale.name));
    }
  } catch {
    // Ignore cleanup errors
  }

  return {
    audioUrl: `/api/media/tts/${filename}`,
    audioPath,
    audioBase64: base64Audio,
    audioMimeType: mimeType,
  };
}
