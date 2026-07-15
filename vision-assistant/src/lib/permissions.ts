import type { GeoPoint } from "@/lib/types";

export type PermissionSnapshot = {
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  geo?: GeoPoint;
};

export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    for (const t of stream.getTracks()) t.stop();
    return true;
  } catch {
    return false;
  }
}

export async function requestCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    for (const t of stream.getTracks()) t.stop();
    return true;
  } catch {
    return false;
  }
}

export async function requestGeolocation(): Promise<{
  ok: boolean;
  geo?: GeoPoint;
}> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          geo: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
      },
      () => resolve({ ok: false }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

/**
 * Soft start: mic + location only. Camera is requested when user opens video mode.
 */
export async function requestBasicPermissions(): Promise<PermissionSnapshot> {
  const result: PermissionSnapshot = {
    camera: false,
    microphone: false,
    geolocation: false,
  };

  result.microphone = await requestMicrophonePermission();
  const geoSnap = await requestGeolocation();
  result.geolocation = geoSnap.ok;
  if (geoSnap.geo) result.geo = geoSnap.geo;

  return result;
}

/** @deprecated use requestBasicPermissions + requestCameraPermission */
export async function requestAllPermissions(): Promise<PermissionSnapshot> {
  const basic = await requestBasicPermissions();
  const camera = await requestCameraPermission();
  return { ...basic, camera };
}
