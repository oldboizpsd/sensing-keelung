import { CONFIG } from './config.js';

// 打開 Webcam。失敗時回傳 null，網頁仍可在除錯模式用滑鼠模擬。
export async function startCamera(video) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: CONFIG.camera.width }, height: { ideal: CONFIG.camera.height }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise((r) => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
    return stream;
  } catch (err) {
    console.warn('[camera] 打不開鏡頭：', err);
    return null;
  }
}
