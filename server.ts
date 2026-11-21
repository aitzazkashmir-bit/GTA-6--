import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { isGeminiConfigured } from './server/geminiClient.ts';
import {
  checkFfmpegCapabilities,
  ensureDemoVideo,
  extractYouTubeVideoId,
  probeMediaFile,
  streamMediaFile,
  UPLOAD_DIR,
} from './server/media.ts';
import { analyzeGameplayFrame } from './server/aiBrain.ts';
import { generatePakistaniUrduSpeech } from './server/tts.ts';
import {
  createYouTubeLiveBroadcast,
  fetchMyYouTubeChannel,
  getServerRtmpUrl,
  inspectPublicYouTubeVideo,
  transitionYouTubeBroadcast,
} from './server/youtube.ts';
import { ffmpegStreamer, writeLiveAssSubtitleFile } from './server/streamer.ts';
import { wsHub } from './server/wsHub.ts';
import type {
  CommentaryItem,
  StreamQualityPreset,
  StudioSettings,
  SubtitleSettings,
  SystemCapabilities,
  TtsModelId,
  VideoSourceInfo,
  VoicePersonaId,
} from './src/types.ts';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Support configurable backend URL deployments (CORS when VITE_BACKEND_URL points externally)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. Health & real API validation
  app.get('/api/health', async (_req, res) => {
    const ffmpegCaps = await checkFfmpegCapabilities();
    const firebasePath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const capabilities: SystemCapabilities = {
      geminiConfigured: isGeminiConfigured(),
      geminiModel: 'gemini-4-hydrogen',
      ttsModels: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'],
      ffmpegAvailable: ffmpegCaps.ffmpegAvailable,
      ffmpegVersion: ffmpegCaps.ffmpegVersion,
      ffprobeAvailable: ffmpegCaps.ffprobeAvailable,
      firebaseOAuthConfigured: fs.existsSync(firebasePath),
      youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
      serverTime: new Date().toISOString(),
    };
    res.json({ capabilities, studio: wsHub.getState() });
  });

  // 2. Demo & Media Routes
  app.post('/api/media/demo', async (_req, res) => {
    try {
      const demo = await ensureDemoVideo();
      wsHub.setActiveSource(demo);
      res.json({ source: demo });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to prepare demo video.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/media/upload', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No video file provided.' });
        return;
      }

      const probed = await probeMediaFile(req.file.path).catch(() => ({
        durationSec: undefined,
        width: undefined,
        height: undefined,
        codec: undefined,
      }));

      const source: VideoSourceInfo = {
        id: `upload-${Date.now()}`,
        kind: 'upload',
        label: req.file.originalname,
        playbackUrl: `/api/media/stream/uploads/${req.file.filename}`,
        serverPath: req.file.path,
        ...probed,
        authorizedNotice: 'Owned/licensed gameplay video uploaded directly to studio server.',
      };

      wsHub.setActiveSource(source);
      res.json({ source });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Video upload failed.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/media/validate-url', async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || !url.trim()) {
        res.status(400).json({ error: 'Please provide a media or stream URL.' });
        return;
      }

      const cleanUrl = url.trim();
      const ytId = extractYouTubeVideoId(cleanUrl);
      if (ytId) {
        const token = extractBearerToken(req) || undefined;
        const ytMeta = await inspectPublicYouTubeVideo({ videoId: ytId, accessToken: token });
        res.status(422).json({
          error: `YouTube watch URLs (${ytMeta.title} by ${ytMeta.channelTitle}) cannot be ripped or re-encoded into FFmpeg due to YouTube Terms of Service & DRM protections. Use an owned video upload, live screen/capture input, or a direct authorized MP4/HLS/RTMP feed.`,
          youtubeMetadata: ytMeta,
        });
        return;
      }

      if (
        !cleanUrl.startsWith('http://') &&
        !cleanUrl.startsWith('https://') &&
        !cleanUrl.startsWith('rtmp://')
      ) {
        res.status(400).json({ error: 'URL must start with https://, http://, or rtmp://' });
        return;
      }

      const probed = await probeMediaFile(cleanUrl);
      if (!probed.width || !probed.height) {
        res.status(422).json({
          error: 'No readable video stream detected at this URL. Verify the stream is public/authorized and accessible.',
        });
        return;
      }

      const source: VideoSourceInfo = {
        id: `url-${Date.now()}`,
        kind: 'authorized_url',
        label: new URL(cleanUrl).hostname + new URL(cleanUrl).pathname.slice(0, 28),
        playbackUrl: cleanUrl.startsWith('rtmp://') ? undefined : cleanUrl,
        externalUrl: cleanUrl,
        ...probed,
        authorizedNotice: 'Authorized external video/stream verified via ffprobe.',
      };

      wsHub.setActiveSource(source);
      res.json({ source });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Could not validate external media URL.';
      res.status(422).json({ error: msg });
    }
  });

  app.post('/api/media/source/screen', (req, res) => {
    const { label, width, height } = req.body as {
      label?: string;
      width?: number;
      height?: number;
    };
    const source: VideoSourceInfo = {
      id: `capture-${Date.now()}`,
      kind: 'screen_capture',
      label: label || 'Live Screen / Capture Device',
      width,
      height,
      authorizedNotice: 'Live authorized display/capture input running in browser studio.',
    };
    wsHub.setActiveSource(source);
    res.json({ source });
  });

  app.get('/api/media/stream/demo/:filename', (req, res) =>
    streamMediaFile(req, res, 'demo')
  );
  app.get('/api/media/stream/uploads/:filename', (req, res) =>
    streamMediaFile(req, res, 'uploads')
  );
  app.get('/api/media/tts/:filename', (req, res) =>
    streamMediaFile(req, res, 'tts')
  );
  app.get('/api/media/preview/:filename', (req, res) =>
    streamMediaFile(req, res, 'preview')
  );

  // 3. AI Gameplay Brain + Pakistani Urdu TTS
  app.post('/api/ai/analyze-frame', async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error:
            'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to enable AI Gameplay Brain & Urdu TTS.',
        });
        return;
      }

      const {
        frameBase64,
        mimeType,
        videoTimeSec = 0,
        recentLines = [],
        settings,
        forceSpeak = false,
      } = req.body as {
        frameBase64?: string;
        mimeType?: string;
        videoTimeSec?: number;
        recentLines?: string[];
        settings?: StudioSettings;
        forceSpeak?: boolean;
      };

      if (!frameBase64) {
        res.status(400).json({ error: 'frameBase64 is required for gameplay analysis.' });
        return;
      }

      const humorLevel = settings?.humorLevel || 'high';
      const commentarySpeed = settings?.commentarySpeed || 1.0;
      const voiceId: VoicePersonaId = settings?.voiceId || 'Fenrir';
      const ttsModel: TtsModelId = settings?.ttsModel || 'gemini-3.8-flash-tts';

      const analysis = await analyzeGameplayFrame({
        frameBase64,
        mimeType,
        videoTimeSec,
        humorLevel,
        commentarySpeed,
        recentLines,
        forceSpeak,
      });

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let audioUrl: string | undefined;
      let audioBase64: string | undefined;
      let audioMimeType: string | undefined;
      let ttsError: string | undefined;

      if (analysis.shouldSpeak) {
        if (settings?.subtitles) {
          writeLiveAssSubtitleFile({
            urduText: analysis.commentaryUrdu,
            romanText: analysis.commentaryRoman,
            settings: settings.subtitles,
          });
        }

        try {
          const tts = await generatePakistaniUrduSpeech({
            id,
            textUrdu: analysis.commentaryUrdu,
            emotion: analysis.emotion,
            voiceId,
            ttsModel,
            speed: commentarySpeed,
          });
          audioUrl = tts.audioUrl;
          audioBase64 = tts.audioBase64;
          audioMimeType = tts.audioMimeType;
        } catch (err) {
          ttsError = err instanceof Error ? err.message : 'TTS audio generation failed.';
        }
      }

      const item: CommentaryItem = {
        id,
        createdAt: new Date().toISOString(),
        videoTimeSec,
        eventType: analysis.eventType,
        intensity: analysis.intensity,
        emotion: analysis.emotion,
        sceneSummary: analysis.sceneSummary,
        commentaryRoman: analysis.commentaryRoman,
        commentaryUrdu: analysis.commentaryUrdu,
        audioUrl,
        audioBase64,
        audioMimeType,
        ttsError,
        latencyMs: analysis.latencyMs,
      };

      if (analysis.shouldSpeak) {
        wsHub.pushCommentary(item);
      }

      res.json({ commentary: item, shouldSpeak: analysis.shouldSpeak });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'AI gameplay analysis failed.';
      wsHub.broadcastError(msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/tts/test', async (req, res) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured. Add it in Secrets to synthesize voice.',
        });
        return;
      }
      const {
        voiceId = 'Fenrir',
        ttsModel = 'gemini-3.8-flash-tts',
        speed = 1.0,
        textUrdu = 'اے بھائی صاحب! جی ٹی اے سکس کی لائیو سٹریم میں خوش آمدید، آج وائس سٹی میں فل دھمال مچنے والا ہے!',
      } = req.body as {
        voiceId?: VoicePersonaId;
        ttsModel?: TtsModelId;
        speed?: number;
        textUrdu?: string;
      };

      const tts = await generatePakistaniUrduSpeech({
        id: `sample-${Date.now()}`,
        textUrdu,
        emotion: 'excited',
        voiceId,
        ttsModel,
        speed,
      });

      res.json({
        audioUrl: tts.audioUrl,
        audioBase64: tts.audioBase64,
        audioMimeType: tts.audioMimeType,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'TTS test failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 4. Studio Playback Lifecycle
  app.post('/api/studio/status', (req, res) => {
    const { status } = req.body as { status?: 'idle' | 'analyzing' | 'live' | 'paused' };
    if (!status) {
      res.status(400).json({ error: 'status is required.' });
      return;
    }
    wsHub.setStreamStatus(status);
    if (status === 'paused') ffmpegStreamer.pause();
    if (status === 'analyzing' || status === 'live') ffmpegStreamer.resume();
    if (status === 'idle') ffmpegStreamer.stop();
    res.json({ state: wsHub.getState() });
  });

  // 5. YouTube Data API v3 Routes (Bearer Token Auth)
  app.get('/api/youtube/channel', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Google OAuth access token required.' });
      return;
    }
    try {
      const channel = await fetchMyYouTubeChannel(token);
      res.json({ channel });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to fetch YouTube channel.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/youtube/broadcast', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Google OAuth access token required.' });
      return;
    }
    try {
      const {
        title = 'GTA 6 Live Gameplay — Pakistani Urdu AI Commentary',
        description = 'Live AI Urdu gaming commentary stream powered by GTA 6 AI Urdu Live Host.',
        privacyStatus = 'unlisted',
        resolution = '720p',
        frameRate = '30fps',
      } = req.body as {
        title?: string;
        description?: string;
        privacyStatus?: 'public' | 'unlisted' | 'private';
        resolution?: '720p' | '1080p';
        frameRate?: '30fps' | '60fps';
      };

      const broadcast = await createYouTubeLiveBroadcast({
        accessToken: token,
        title,
        description,
        privacyStatus,
        resolution,
        frameRate,
      });

      wsHub.setActiveBroadcast(broadcast);
      res.json({ broadcast });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create YouTube Live broadcast.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/youtube/broadcast/transition', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Google OAuth access token required.' });
      return;
    }
    try {
      const { broadcastId, broadcastStatus } = req.body as {
        broadcastId?: string;
        broadcastStatus?: 'testing' | 'live' | 'complete';
      };
      if (!broadcastId || !broadcastStatus) {
        res.status(400).json({ error: 'broadcastId and broadcastStatus are required.' });
        return;
      }

      const result = await transitionYouTubeBroadcast({
        accessToken: token,
        broadcastId,
        broadcastStatus,
      });

      const current = wsHub.getState().activeBroadcast;
      if (current && current.broadcastId === broadcastId) {
        wsHub.setActiveBroadcast({ ...current, lifeCycleStatus: result.lifeCycleStatus });
      }
      if (broadcastStatus === 'complete') {
        ffmpegStreamer.stop();
        wsHub.setStreamStatus('idle');
      } else if (broadcastStatus === 'live') {
        wsHub.setStreamStatus('live');
      }

      res.json(result);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to transition YouTube broadcast.';
      res.status(400).json({ error: msg });
    }
  });

  // 6. FFmpeg Broadcast Pipeline Controls
  app.post('/api/stream/ffmpeg/start', (req, res) => {
    try {
      const {
        mode = 'local_preview',
        broadcastId,
        customRtmpUrl,
        quality = '720p30',
        subtitleSettings,
      } = req.body as {
        mode?: 'youtube_rtmp' | 'custom_rtmp' | 'local_preview';
        broadcastId?: string;
        customRtmpUrl?: string;
        quality?: StreamQualityPreset;
        subtitleSettings?: SubtitleSettings;
      };

      const activeSource = wsHub.getState().activeSource;
      const inputPathOrUrl = activeSource?.serverPath || activeSource?.externalUrl;
      if (!inputPathOrUrl) {
        res.status(400).json({
          error:
            'Select a server-accessible video source (Test Mode Demo, Uploaded Video, or Direct Stream URL) before starting FFmpeg.',
        });
        return;
      }

      let rtmpTargetUrl: string | undefined;
      if (mode === 'youtube_rtmp') {
        if (!broadcastId) {
          res.status(400).json({ error: 'Create a YouTube Live Broadcast first.' });
          return;
        }
        const resolved = getServerRtmpUrl(broadcastId);
        if (!resolved) {
          res.status(404).json({ error: 'Broadcast RTMP credentials not found on server.' });
          return;
        }
        rtmpTargetUrl = resolved;
      } else if (mode === 'custom_rtmp') {
        if (!customRtmpUrl || !customRtmpUrl.startsWith('rtmp://')) {
          res.status(400).json({ error: 'Valid rtmp:// destination URL is required.' });
          return;
        }
        rtmpTargetUrl = customRtmpUrl;
      }

      ffmpegStreamer.start({
        inputPathOrUrl,
        mode,
        rtmpTargetUrl,
        quality,
        subtitleSettings: subtitleSettings || {
          enabled: true,
          scriptMode: 'dual',
          fontFamily: 'Noto Nastaliq Urdu',
          fontSizePx: 26,
          position: 'bottom',
          textColor: '#FFFFFF',
          bgOpacity: 0.72,
        },
      });

      wsHub.setStreamStatus(mode === 'local_preview' ? 'analyzing' : 'live');
      res.json({ telemetry: ffmpegStreamer.getTelemetry() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start FFmpeg.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/stream/ffmpeg/stop', (_req, res) => {
    ffmpegStreamer.stop();
    wsHub.setStreamStatus('idle');
    res.json({ telemetry: ffmpegStreamer.getTelemetry() });
  });

  // Frontend serving: Vite middleware in dev, dist/ in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  wsHub.attach(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GTA 6 AI Urdu Live Host server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
