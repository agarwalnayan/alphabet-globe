import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Hand gesture detection using MediaPipe Hands
 * Gestures detected:
 * - SWIPE_LEFT: Hand swipes left across the camera view
 * - SWIPE_RIGHT: Hand swipes right across the camera view
 * - OPEN_PALM: All fingers extended (stop signal)
 * - FIST: All fingers curled (spin signal)
 * - NONE: Default
 */

function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length === 0) return 'NONE';

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];

  const indexPIP = landmarks[6];
  const middlePIP = landmarks[10];
  const ringPIP = landmarks[14];
  const pinkyPIP = landmarks[18];

  const indexExtended = indexTip.y < indexPIP.y;
  const middleExtended = middleTip.y < middlePIP.y;
  const ringExtended = ringTip.y < ringPIP.y;
  const pinkyExtended = pinkyTip.y < pinkyPIP.y;

  const allExtended = indexExtended && middleExtended && ringExtended && pinkyExtended;
  const allCurled = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

  if (allExtended) return 'OPEN_PALM';
  if (allCurled) return 'FIST';
  return 'NONE';
}

export default function useHandGestures(onGesture) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [numHandsDetected, setNumHandsDetected] = useState(0);
  const handDetectedRef = useRef(false);
  const numHandsRef = useRef(0);
  const swipeTrack = useRef({ points: [], locked: false });
  const lastSwipeAt = useRef(0);

  const drawHand = useCallback((landmarks, ctx, width, height) => {
    if (!landmarks) return;

    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17]
    ];

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.lineWidth = 1.5;

    connections.forEach(([a, b]) => {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
      ctx.stroke();
    });

    landmarks.forEach((lm, i) => {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, i === 8 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 8 ? '#7fff00' : 'rgba(0, 212, 255, 0.9)';
      ctx.fill();
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const initMediaPipe = async () => {
      // Dynamically load MediaPipe from CDN if not available
      const loadScript = (src) => new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });

      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');

        if (!mounted) return;

        // eslint-disable-next-line no-undef
        const hands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.6
        });

        hands.onResults((results) => {
          if (!canvasRef.current) return;
          const ctx = canvasRef.current.getContext('2d');
          const { width, height } = canvasRef.current;

          ctx.clearRect(0, 0, width, height);

          // Draw video frame
          if (results.image) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(results.image, -width, 0, width, height);
            ctx.restore();
          }
          const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
          
          if (numHands !== numHandsRef.current) {
            numHandsRef.current = numHands;
            setNumHandsDetected(numHands);
          }

          if (numHands > 0) {
            if (!handDetectedRef.current) {
              handDetectedRef.current = true;
              setIsHandDetected(true);
            }
            
            // Draw all detected hands
            results.multiHandLandmarks.forEach(lm => {
              const mirrored = lm.map(p => ({ ...p, x: 1 - p.x }));
              drawHand(mirrored, ctx, width, height);
            });

            // Only process gestures if exactly ONE hand is detected
            if (numHands === 1) {
              const landmarks = results.multiHandLandmarks[0];
              const mirrored = landmarks.map(lm => ({ ...lm, x: 1 - lm.x }));
              const gesture = classifyGesture(landmarks);
              const now = performance.now();
              let emittedGesture = gesture;

              const palmPoints = [0, 1, 2, 5, 9, 13, 17];
              const handCenter = palmPoints.reduce(
                (acc, idx) => ({ x: acc.x + mirrored[idx].x, y: acc.y + mirrored[idx].y }),
                { x: 0, y: 0 }
              );
              handCenter.x /= palmPoints.length;
              handCenter.y /= palmPoints.length;

              const horizontalThreshold = 0.12;
              const verticalThreshold = 0.15;
              const unlockDistance = 0.06;
              const minSwipeDuration = 80;
              const maxSwipeDuration = 1000;

              if (gesture === 'OPEN_PALM') {
                const points = swipeTrack.current.points;
                points.push({ x: handCenter.x, y: handCenter.y, time: now });
                if (points.length > 8) points.shift();

                const first = points[0];
                const dx = handCenter.x - first.x;
                const dy = handCenter.y - first.y;
                const horizontalMovement = Math.abs(dx);
                const verticalMovement = Math.abs(dy);
                const duration = now - first.time;

                if (swipeTrack.current.locked) {
                  if (horizontalMovement < unlockDistance && verticalMovement < unlockDistance) {
                    swipeTrack.current.locked = false;
                    swipeTrack.current.points = [];
                  }
                } else if (
                  points.length >= 3 &&
                  duration >= minSwipeDuration &&
                  duration <= maxSwipeDuration &&
                  horizontalMovement > horizontalThreshold &&
                  horizontalMovement > verticalMovement * 2 &&
                  verticalMovement < verticalThreshold &&
                  now - lastSwipeAt.current > 350
                ) {
                  emittedGesture = dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';
                  lastSwipeAt.current = now;
                  swipeTrack.current.locked = true;
                  swipeTrack.current.points = [];
                }
              } else {
                swipeTrack.current.points = [];
                swipeTrack.current.locked = false;
              }

              onGesture(emittedGesture);
            } else {
              // Too many hands for reliable gestures
              swipeTrack.current.points = [];
              swipeTrack.current.locked = false;
              onGesture('NONE');
            }
          } else {
            if (handDetectedRef.current) {
              handDetectedRef.current = false;
              setIsHandDetected(false);
            }
            onGesture('NONE');
          }
        });

        handsRef.current = hands;

        // Start webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' }
        });

        if (!videoRef.current || !mounted) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // eslint-disable-next-line no-undef
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 320,
          height: 240
        });

        camera.start();
        cameraRef.current = camera;

        if (mounted) setIsReady(true);

      } catch (err) {
        console.warn('Hand tracking init failed:', err);
        // Still mark ready so app works without hand tracking
        if (mounted) setIsReady(true);
      }
    };

    initMediaPipe();

    return () => {
      mounted = false;
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (e) {}
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
      if (handsRef.current) {
        try { handsRef.current.close(); } catch (e) {}
      }
    };
  }, [onGesture, drawHand]);

  return { videoRef, canvasRef, isReady, isHandDetected, numHandsDetected };
}
