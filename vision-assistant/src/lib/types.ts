export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type GeoPoint = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export type PoiResult = {
  id: string;
  name: string;
  address?: string;
  distanceMeters?: number;
  category?: string;
  location?: { lat: number; lng: number };
  /** 当前店内/附近人数相关信息（公开扫街榜未开放时可能为估算） */
  crowdLabel?: string;
  crowdCount?: number;
  hotScore?: number;
  source: "amap" | "demo" | "scanstreet-adapter";
};

export type PublicProfile = {
  id: string;
  displayName: string;
  occupation?: string;
  bio?: string;
  /** data URL or public path for face photo */
  faceImageDataUrl: string;
  discoverable: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ChatRequestBody = {
  text: string;
  imageDataUrl?: string;
  geo?: GeoPoint;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId?: string;
};

export type ScreenTarget = {
  id: string;
  label: string;
  /** normalized center X in [0,1], image top-left origin */
  cx: number;
  /** normalized center Y in [0,1] */
  cy: number;
  /** normalized width */
  w: number;
  /** normalized height */
  h: number;
  confidence?: number;
};

export type ScreenTargetDto = ScreenTarget;

export type ChatResponseBody = {
  reply: string;
  pois?: PoiResult[];
  matchedPeople?: Array<{
    id: string;
    displayName: string;
    occupation?: string;
    bio?: string;
    confidence?: number;
  }>;
  /** client should fire /api/detect after reply */
  needTrack?: boolean;
  mode: "live" | "demo";
  usedTools?: string[];
  provider?: string;
};
