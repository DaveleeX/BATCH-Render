import type { GeoPoint } from "@/lib/types";

export type PermissionSnapshot = {
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  geo?: GeoPoint;
};

/**
 * One-shot permission prompt: camera + mic + location.
 * Browser may still show system dialogs sequentially, but we request them together
 * from a single user gesture so the app feel is “一次性授权”.
 */
export async function requestAllPermissions(): Promise<PermissionSnapshot> {
  const result: PermissionSnapshot = {
    camera: false,
    microphone: false,
    geolocation: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: true,
    });
    result.camera = stream.getVideoTracks().length > 0;
    result.microphone = stream.getAudioTracks().length > 0;
    for (const t of stream.getTracks()) t.stop();
  } catch {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      result.camera = true;
      for (const t of cam.getTracks()) t.stop();
    } catch {
      result.camera = false;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      result.microphone = true;
      for (const t of mic.getTracks()) t.stop();
    } catch {
      result.microphone = false;
    }
  }

  await new Promise<void>((resolve) => {
    if (!navigator.geolocation) {
      result.geolocation = false;
      resolve();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        result.geolocation = true;
        result.geo = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        resolve();
      },
      () => {
        result.geolocation = false;
        resolve();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });

  return result;
}
