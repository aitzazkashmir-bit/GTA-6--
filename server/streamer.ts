import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { getFfmpegBin, PREVIEW_DIR, SUBTITLE_DIR } from './media.ts';
import { wsHub } from './wsHub.ts';
import type {
  FfmpegTelemetry,
  StreamQualityPreset,
  SubtitleSettings,
} from '../src/types.ts';

function hexToAssColor(hex: string, alphaHex = '00'): string {
  const clean = hex.replace('#', '').padEnd(6, 'F');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  // ASS format uses &HAABBGGRR
  return `&H${alphaHex}${b}${g}${r}`;
}

export function writeLiveAssSubtitleFile(params: {
  urduText: string;
  romanText: string;
  settings: SubtitleSettings;
}): string {
  const assPath = path.join(SUBTITLE_DIR, 'live.ass');
  const alignment =
    params.settings.position === 'top'
      ? 8
      : params.settings.position === 'center_low'
        ? 2
        : 2;
  const marginV =
    params.settings.position === 'top'
      ? 36
      : params.settings.position === 'center_low'
        ? 110
        : 42;

  const primaryColor = hexToAssColor(params.settings.textColor || '#FFFFFF', '00');
  const bgAlpha = Math.round((1 - Math.min(1, Math.max(0, params.settings.bgOpacity))) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  const backColor = hexToAssColor('#090B10', bgAlpha);

  const line =
    params.settings.scriptMode === 'roman'
      ? params.romanText
      : params.settings.scriptMode === 'dual'
        ? `${params.urduText}\\N${params.romanText}`
        : params.urduText;

  const safeLine = line.replace(/\r?\n/g, '\\N');

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${params.settings.fontFamily},${params.settings.fontSizePx},${primaryColor},&H000000FF,&H00000000,${backColor},1,0,0,0,100,100,0,0,3,2,0,${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:10:00.00,Default,,0,0,0,,${safeLine}
`;

  fs.writeFileSync(assPath, assContent, 'utf8');
  return assPath;
}

class FfmpegStreamer {
  private proc: ChildProcess | null = null;
  private isPaused = false;
  private telemetry: FfmpegTelemetry = {
    active: false,
    mode: 'idle',
    fps: 0,
    bitrateKbps: 0,
    frameCount: 0,
    speed: '0.0x',
    outTime: '00:00:00',
    recentLogs: [],
  };

  getTelemetry(): FfmpegTelemetry {
    return this.telemetry;
  }

  private pushLog(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.telemetry.recentLogs = [...this.telemetry.recentLogs.slice(-24), trimmed];
  }

  start(params: {
    inputPathOrUrl: string;
    mode: 'youtube_rtmp' | 'custom_rtmp' | 'local_preview';
    rtmpTargetUrl?: string;
    quality: StreamQualityPreset;
    subtitleSettings: SubtitleSettings;
    latestTtsWavPath?: string;
  }) {
    this.stop();

    const { width, height, fps, bitrate } =
      params.quality === '1080p60'
        ? { width: 1920, height: 1080, fps: 60, bitrate: '4500k' }
        : params.quality === '1080p30'
          ? { width: 1920, height: 1080, fps: 30, bitrate: '3500k' }
          : { width: 1280, height: 720, fps: 30, bitrate: '2500k' };

    const assPath = writeLiveAssSubtitleFile({
      urduText: 'GTA 6 AI Urdu Live Host — براہِ راست اردو کمنٹری',
      romanText: 'GTA 6 AI Urdu Live Host — Live Stream Active',
      settings: params.subtitleSettings,
    });

    const args: string[] = ['-re'];
    const isRemoteStream =
      params.inputPathOrUrl.startsWith('rtmp://') ||
      params.inputPathOrUrl.startsWith('http://') ||
      params.inputPathOrUrl.startsWith('https://');

    if (!isRemoteStream) {
      args.push('-stream_loop', '-1');
    }
    args.push('-i', params.inputPathOrUrl);

    if (params.latestTtsWavPath && fs.existsSync(params.latestTtsWavPath)) {
      args.push('-i', params.latestTtsWavPath);
    }

    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    const vf = params.subtitleSettings.enabled
      ? `${scaleFilter},ass='${escapedAss}'`
      : scaleFilter;

    args.push('-vf', vf);
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      'zerolatency',
      '-r',
      String(fps),
      '-g',
      String(fps * 2),
      '-b:v',
      bitrate,
      '-maxrate',
      bitrate,
      '-bufsize',
      `${Number.parseInt(bitrate, 10) * 2}k`,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-progress',
      'pipe:1',
      '-nostats'
    );

    if (params.mode === 'local_preview') {
      const outPath = path.join(PREVIEW_DIR, 'broadcast-preview.mp4');
      args.push('-y', '-t', '20', '-f', 'mp4', '-movflags', '+faststart', outPath);
    } else {
      if (!params.rtmpTargetUrl) {
        throw new Error('RTMP destination URL is required for live broadcast mode.');
      }
      args.push('-f', 'flv', params.rtmpTargetUrl);
    }

    this.isPaused = false;
    this.telemetry = {
      active: true,
      mode: params.mode,
      fps: 0,
      bitrateKbps: 0,
      frameCount: 0,
      speed: '1.0x',
      outTime: '00:00:00',
      recentLogs: [`FFmpeg started (${params.mode} · ${params.quality})`],
    };
    wsHub.updateFfmpegTelemetry(this.telemetry);

    const proc = spawn(getFfmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;

    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        const [k, v] = line.split('=');
        if (!k || v === undefined) continue;
        const val = v.trim();
        if (k === 'frame') this.telemetry.frameCount = Number.parseInt(val, 10) || 0;
        if (k === 'fps') this.telemetry.fps = Math.round(Number.parseFloat(val) || 0);
        if (k === 'bitrate') {
          const num = Number.parseFloat(val.replace('kbits/s', ''));
          if (Number.isFinite(num)) this.telemetry.bitrateKbps = Math.round(num);
        }
        if (k === 'speed') this.telemetry.speed = val;
        if (k === 'out_time') this.telemetry.outTime = val.split('.')[0] || val;
        if (k === 'progress' && (val === 'continue' || val === 'end')) {
          wsHub.updateFfmpegTelemetry({ ...this.telemetry });
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const line of text.split('\n')) {
        if (
          line.includes('Error') ||
          line.includes('error') ||
          line.includes('Opening') ||
          line.includes('Stream #') ||
          line.includes('Output #')
        ) {
          // Never log raw RTMP stream key URLs
          const sanitized = line.replace(/(rtmp:\/\/[^/]+\/[^/]+\/)[^\s'"]+/gi, '$1••••');
          this.pushLog(sanitized);
        }
      }
      wsHub.updateFfmpegTelemetry({ ...this.telemetry });
    });

    proc.on('close', (code) => {
      const wasActive = this.telemetry.active;
      this.proc = null;
      this.telemetry.active = false;
      this.telemetry.mode = 'idle';
      if (code !== 0 && code !== null && wasActive) {
        this.telemetry.lastError = `FFmpeg exited with code ${code}`;
        this.pushLog(this.telemetry.lastError);
        wsHub.broadcastError(this.telemetry.lastError);
      } else {
        this.pushLog('FFmpeg pipeline stopped cleanly.');
      }
      wsHub.updateFfmpegTelemetry({ ...this.telemetry });
    });
  }

  pause() {
    if (this.proc && !this.isPaused) {
      this.proc.kill('SIGSTOP');
      this.isPaused = true;
      this.pushLog('FFmpeg encoder paused (SIGSTOP).');
      wsHub.updateFfmpegTelemetry({ ...this.telemetry });
    }
  }

  resume() {
    if (this.proc && this.isPaused) {
      this.proc.kill('SIGCONT');
      this.isPaused = false;
      this.pushLog('FFmpeg encoder resumed (SIGCONT).');
      wsHub.updateFfmpegTelemetry({ ...this.telemetry });
    }
  }

  stop() {
    if (this.proc) {
      if (this.isPaused) {
        try {
          this.proc.kill('SIGCONT');
        } catch {
          // ignore
        }
      }
      this.telemetry.active = false;
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.isPaused = false;
    this.telemetry = {
      ...this.telemetry,
      active: false,
      mode: 'idle',
      fps: 0,
      bitrateKbps: 0,
    };
    wsHub.updateFfmpegTelemetry(this.telemetry);
  }
}

export const ffmpegStreamer = new FfmpegStreamer();
