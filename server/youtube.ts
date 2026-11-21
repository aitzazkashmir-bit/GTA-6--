import type { YouTubeBroadcastState, YouTubeChannelInfo } from '../src/types.ts';

interface SecretBroadcastIngest {
  broadcastId: string;
  streamId: string;
  rtmpFullUrl: string;
  maskedIngestionUrl: string;
  watchUrl: string;
  title: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  lifeCycleStatus: string;
  resolution: string;
}

// Held strictly in server memory so stream keys are never exposed to the browser
const serverBroadcastSecrets = new Map<string, SecretBroadcastIngest>();

export function getServerRtmpUrl(broadcastId: string): string | null {
  return serverBroadcastSecrets.get(broadcastId)?.rtmpFullUrl || null;
}

async function youtubeFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const errObj = json.error as { message?: string; errors?: Array<{ reason?: string }> } | undefined;
    const reason = errObj?.errors?.[0]?.reason;
    const message =
      errObj?.message || `YouTube API request failed with HTTP ${res.status}`;
    const enriched = reason ? `${message} (${reason})` : message;
    throw new Error(enriched);
  }

  return json as T;
}

export async function fetchMyYouTubeChannel(
  accessToken: string
): Promise<YouTubeChannelInfo> {
  const data = await youtubeFetch<{
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        customUrl?: string;
        thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
      };
      statistics?: { subscriberCount?: string };
      status?: { longUploadsStatus?: string };
    }>;
  }>(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,status&mine=true',
    accessToken
  );

  const ch = data.items?.[0];
  if (!ch) {
    throw new Error(
      'No YouTube channel found on this Google account. Create a YouTube channel first to enable live streaming.'
    );
  }

  return {
    id: ch.id,
    title: ch.snippet?.title || 'Connected YouTube Channel',
    customUrl: ch.snippet?.customUrl,
    thumbnailUrl:
      ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url,
    subscriberCount: ch.statistics?.subscriberCount,
    liveStreamingEnabled: true,
  };
}

export async function createYouTubeLiveBroadcast(params: {
  accessToken: string;
  title: string;
  description: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  resolution: '720p' | '1080p';
  frameRate: '30fps' | '60fps';
}): Promise<YouTubeBroadcastState> {
  const scheduledStartTime = new Date(Date.now() + 15_000).toISOString();

  // 1. Create YouTube Live Broadcast
  const broadcast = await youtubeFetch<{
    id: string;
    status?: { lifeCycleStatus?: string; privacyStatus?: string };
  }>(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails,status',
    params.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          title: params.title,
          description: params.description,
          scheduledStartTime,
        },
        status: {
          privacyStatus: params.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: false,
          enableAutoStop: false,
          latencyPreference: 'low',
        },
      }),
    }
  );

  // 2. Create YouTube Live Stream (RTMP ingestion endpoint)
  const stream = await youtubeFetch<{
    id: string;
    cdn?: {
      ingestionInfo?: {
        ingestionAddress?: string;
        streamName?: string;
      };
    };
  }>(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status',
    params.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          title: `${params.title} — Stream Key`,
        },
        cdn: {
          frameRate: params.frameRate,
          ingestionType: 'rtmp',
          resolution: params.resolution,
        },
      }),
    }
  );

  // 3. Bind stream to broadcast
  await youtubeFetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${encodeURIComponent(
      broadcast.id
    )}&part=id,contentDetails&streamId=${encodeURIComponent(stream.id)}`,
    params.accessToken,
    { method: 'POST' }
  );

  const ingestionAddress = stream.cdn?.ingestionInfo?.ingestionAddress;
  const streamName = stream.cdn?.ingestionInfo?.streamName;
  if (!ingestionAddress || !streamName) {
    throw new Error('YouTube created the stream but did not return RTMP ingestion details.');
  }

  const rtmpFullUrl = `${ingestionAddress.replace(/\/$/, '')}/${streamName}`;
  const maskedIngestionUrl = `${ingestionAddress.replace(/\/$/, '')}/••••••••-${streamName.slice(-4)}`;
  const watchUrl = `https://www.youtube.com/watch?v=${broadcast.id}`;

  const state: YouTubeBroadcastState = {
    broadcastId: broadcast.id,
    streamId: stream.id,
    title: params.title,
    privacyStatus: params.privacyStatus,
    lifeCycleStatus: broadcast.status?.lifeCycleStatus || 'ready',
    maskedIngestionUrl,
    watchUrl,
    resolution: `${params.resolution} @ ${params.frameRate}`,
  };

  serverBroadcastSecrets.set(broadcast.id, {
    ...state,
    rtmpFullUrl,
  });

  return state;
}

export async function transitionYouTubeBroadcast(params: {
  accessToken: string;
  broadcastId: string;
  broadcastStatus: 'testing' | 'live' | 'complete';
}): Promise<{ lifeCycleStatus: string }> {
  const res = await youtubeFetch<{
    id: string;
    status?: { lifeCycleStatus?: string };
  }>(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=${encodeURIComponent(
      params.broadcastStatus
    )}&id=${encodeURIComponent(params.broadcastId)}&part=id,status`,
    params.accessToken,
    { method: 'POST' }
  );

  const lifeCycleStatus = res.status?.lifeCycleStatus || params.broadcastStatus;
  const existing = serverBroadcastSecrets.get(params.broadcastId);
  if (existing) {
    existing.lifeCycleStatus = lifeCycleStatus;
  }

  return { lifeCycleStatus };
}

export async function inspectPublicYouTubeVideo(params: {
  videoId: string;
  accessToken?: string;
}): Promise<{
  title: string;
  channelTitle: string;
  embeddable: boolean;
  licensedContent: boolean;
  liveBroadcastContent: string;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const baseUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails&id=${encodeURIComponent(
    params.videoId
  )}`;

  let res: Response;
  if (params.accessToken) {
    res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
  } else if (apiKey) {
    res = await fetch(`${baseUrl}&key=${encodeURIComponent(apiKey)}`);
  } else {
    throw new Error(
      'Sign in with Google or configure YOUTUBE_API_KEY on the server to validate YouTube video metadata.'
    );
  }

  const data = (await res.json()) as {
    error?: { message?: string };
    items?: Array<{
      snippet?: {
        title?: string;
        channelTitle?: string;
        liveBroadcastContent?: string;
      };
      status?: { embeddable?: boolean };
      contentDetails?: { licensedContent?: boolean };
    }>;
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `YouTube metadata lookup failed (${res.status})`);
  }

  const item = data.items?.[0];
  if (!item) {
    throw new Error('YouTube video not found or private.');
  }

  return {
    title: item.snippet?.title || 'YouTube Video',
    channelTitle: item.snippet?.channelTitle || 'Unknown Channel',
    embeddable: Boolean(item.status?.embeddable),
    licensedContent: Boolean(item.contentDetails?.licensedContent),
    liveBroadcastContent: item.snippet?.liveBroadcastContent || 'none',
  };
}
