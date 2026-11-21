import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Request, Response } from 'express';
import type { VideoSourceInfo } from '../src/types.ts';

const execFileAsync = promisify(execFile);

export const MEDIA_ROOT = path.resolve(process.cwd(), 'media');
export const DEMO_DIR = path.join(MEDIA_ROOT, 'demo');
export const UPLOAD_DIR = path.join(MEDIA_ROOT, 'uploads');
export const TTS_DIR = path.join(MEDIA_ROOT, 'tts');
export const SUBTITLE_DIR = path.join(MEDIA_ROOT, 'subtitles');
export const PREVIEW_DIR = path.join(MEDIA_ROOT, 'preview');

export const DEMO_FILENAME = 'vice-highway-demo.mp4';
export const DEMO_PATH = path.join(DEMO_DIR, DEMO_FILENAME);

for (const dir of [MEDIA_ROOT, DEMO_DIR, UPLOAD_DIR, TTS_DIR, SUBTITLE_DIR, PREVIEW_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function getFfmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function getFfprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

export async function checkFfmpegCapabilities(): Promise<{
  ffmpegAvailable: boolean;
  ffmpegVersion: string;
  ffprobeAvailable: boolean;
}> {
  let ffmpegAvailable = false;
  let ffmpegVersion = 'Not installed';
  let ffprobeAvailable = false;

  try {
    const { stdout } = await execFileAsync(getFfmpegBin(), ['-version'], { timeout: 4000 });
    ffmpegAvailable = true;
    const firstLine = stdout.split('\n')[0] || 'ffmpeg available';
    ffmpegVersion = firstLine.replace('ffmpeg version ', '').split(' Copyright')[0].trim();
  } catch {
    ffmpegAvailable = false;
  }

  try {
    await execFileAsync(getFfprobeBin(), ['-version'], { timeout: 4000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }

  return { ffmpegAvailable, ffmpegVersion, ffprobeAvailable };
}

export async function probeMediaFile(filePathOrUrl: string): Promise<{
  durationSec?: number;
  width?: number;
  height?: number;
  codec?: string;
}> {
  const { stdout } = await execFileAsync(
    getFfprobeBin(),
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePathOrUrl,
    ],
    { timeout: 12000 }
  );

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const durationNum = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : undefined;

  return {
    durationSec: Number.isFinite(durationNum) ? Math.round(durationNum!) : undefined,
    width: videoStream?.width,
    height: videoStream?.height,
    codec: videoStream?.codec_name,
  };
}

let demoGenerationPromise: Promise<void> | null = null;

export async function ensureDemoVideo(): Promise<VideoSourceInfo> {
  if (!fs.existsSync(DEMO_PATH)) {
    if (!demoGenerationPromise) {
      demoGenerationPromise = generateDemoVideo().finally(() => {
        demoGenerationPromise = null;
      });
    }
    await demoGenerationPromise;
  }

  let probed = { durationSec: 24, width: 1280, height: 720, codec: 'h264' };
  try {
    const res = await probeMediaFile(DEMO_PATH);
    probed = {
      durationSec: res.durationSec ?? 24,
      width: res.width ?? 1280,
      height: res.height ?? 720,
      codec: res.codec ?? 'h264',
    };
  } catch {
    // Keep sensible defaults if ffprobe fails
  }

  return {
    id: 'demo-vice-highway',
    kind: 'demo',
    label: 'Leonida Highway Pursuit (Licensed Built-In Demo)',
    playbackUrl: `/api/media/stream/demo/${DEMO_FILENAME}`,
    serverPath: DEMO_PATH,
    ...probed,
    authorizedNotice: 'Built-in licensed studio demo video generated locally via FFmpeg.',
  };
}

async function generateDemoVideo(): Promise<void> {
  const img1 = path.resolve(process.cwd(), 'src/assets/images/gta_vice_backdrop_1795236994789.jpg');
  const img2 = path.resolve(process.cwd(), 'src/assets/images/sample_thumb_chase_1795236995584.jpg');

  if (!fs.existsSync(img1) || !fs.existsSync(img2)) {
    // Fallback synthetic color/pattern clip if assets are absent
    await execFileAsync(
      getFfmpegBin(),
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1280x720:rate=30:duration=20',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=220:sample_rate=44100:duration=20',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        DEMO_PATH,
      ],
      { timeout: 60000 }
    );
    return;
  }

  // Build an action-paced 24-second 720p gameplay-style demo from our 16:9 scenes:
  // Part A (0-12s): Coastal highway sunset drive with progressive zoom-in
  // Part B (12-24s): High-speed police chase drift with red/blue tint pulse + HUD overlay
  const filterComplex = [
    "[0:v]scale=1600:900,zoompan=z='min(zoom+0.0014,1.25)':x='iw/2-(iw/zoom/2)+sin(on/18)*18':y='ih/2-(ih/zoom/2)':d=360:s=1280x720:fps=30[v0]",
    "[1:v]scale=1600:900,zoompan=z='1.22-0.001*on':x='iw/2-(iw/zoom/2)+cos(on/12)*28':y='ih/2-(ih/zoom/2)':d=360:s=1280x720:fps=30,eq=contrast=1.08:saturation=1.15[v1]",
    "[v0][v1]xfade=transition=wipeleft:duration=0.8:offset=11.2,drawbox=x=24:y=22:w=310:h=44:color=black@0.65:t=fill,drawtext=text='LEONIDA HIGHWAY  |  148 MPH  |  WANTED ***':fontcolor=white:fontsize=18:x=38:y=36,format=yuv420p[vout]",
    // Synthesize low engine rumble + distant pursuit pulse audio
    "sine=frequency=95:sample_rate=44100:duration=24,volume=0.08[eng];sine=frequency=520:sample_rate=44100:duration=24,tremolo=f=2.4:d=0.85,volume='if(gt(t,11.5),0.06,0.0)'[siren];[eng][siren]amix=inputs=2:duration=longest[aout]"
  ].join(';');

  await execFileAsync(
    getFfmpegBin(),
    [
      '-y',
      '-loop',
      '1',
      '-t',
      '12',
      '-i',
      img1,
      '-loop',
      '1',
      '-t',
      '12',
      '-i',
      img2,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-t',
      '24',
      DEMO_PATH,
    ],
    { timeout: 90000 }
  );
}

export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function streamMediaFile(req: Request, res: Response, folder: 'demo' | 'uploads' | 'tts' | 'preview') {
  const filename = path.basename(req.params.filename || '');
  const baseDir =
    folder === 'demo'
      ? DEMO_DIR
      : folder === 'uploads'
        ? UPLOAD_DIR
        : folder === 'tts'
          ? TTS_DIR
          : PREVIEW_DIR;

  const fullPath = path.join(baseDir, filename);
  if (!fullPath.startsWith(baseDir) || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Media file not found' });
    return;
  }

  const stat = fs.statSync(fullPath);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.wav'
      ? 'audio/wav'
      : ext === '.webm'
        ? 'video/webm'
        : ext === '.mov'
          ? 'video/quicktime'
          : 'video/mp4';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : stat.size - 1;

    if (Number.isNaN(start) || start >= stat.size || end >= stat.size) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(fullPath).pipe(res);
  }
}
