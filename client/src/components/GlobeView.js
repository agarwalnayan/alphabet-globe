import React, { useRef, useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import useHandGestures from '../hooks/useHandGestures';
import { normalizeModelUrl } from '../config/api';
import { equatorPoints, getFocusedAlphabetWindow, sortModelsAlphabetically } from './globeUtils';
import './GlobeView.css';

const gltfLoaderOptions = (loader) => {
  loader.setCrossOrigin('anonymous');
};

function prepareScene(scene) {
  const clone = scene.clone(true);
  clone.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  clone.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    clone.scale.setScalar(0.8 / maxDim);
  }
  return clone;
}

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error(`Failed to load model ${this.props.letter}:`, error);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// Single letter model on the globe
function LetterModel({
  url,
  position,
  isActive,
  index,
  totalLetters,
  showOnlyCurrentLetter,
  onLoaded
}) {
  const { scene } = useGLTF(url, undefined, undefined, gltfLoaderOptions);
  const groupRef = useRef();
  const clonedScene = useMemo(() => prepareScene(scene), [scene]);
  const targetScale = showOnlyCurrentLetter && isActive ? 2.5 : (isActive ? 1.6 : 0.55);
  const currentScale = useRef(targetScale);
  const shouldShow = !showOnlyCurrentLetter || isActive;

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  useEffect(() => {
    currentScale.current = targetScale;
  }, [targetScale]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    currentScale.current = THREE.MathUtils.lerp(
      currentScale.current,
      targetScale,
      delta * 6
    );
    const pulse = 1 + 0.06 * Math.sin(state.clock.elapsedTime * 2 + index);
    groupRef.current.scale.setScalar(currentScale.current * pulse);

    if (showOnlyCurrentLetter && isActive) {
      groupRef.current.position.lerp(new THREE.Vector3(0, 0, 0), delta * 5);
    } else {
      const targetPos = new THREE.Vector3(...position);
      groupRef.current.position.lerp(targetPos, delta * 5);
    }

    const phi = Math.atan2(position[0], position[2]);

    if (isActive) {
      groupRef.current.rotation.y += delta * 1.5;
    } else {
      groupRef.current.rotation.y = phi;
    }

    if (shouldShow) {
      const frontPos = new THREE.Vector3(0, 0, 3.2);
      const pos3 = new THREE.Vector3(...position);
      const dist = pos3.distanceTo(frontPos);
      const opacity = showOnlyCurrentLetter && isActive ? 1 : Math.max(0.15, 1 - dist / 7);
      clonedScene.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.opacity = opacity;
        }
      });
    }
  });

  if (!shouldShow) {
    return <group ref={groupRef} position={position} />;
  }

  const hue = Math.round((index / Math.max(totalLetters, 1)) * 360);

  return (
    <group ref={groupRef} position={position}>
      <primitive object={clonedScene} />
      {isActive && (
        <pointLight intensity={3} distance={2.5} color={`hsl(${hue},80%,60%)`} />
      )}
    </group>
  );
}

function LetterModelSlot({ model, ...props }) {
  return (
    <ModelErrorBoundary letter={model.letter} onError={props.onError}>
      <Suspense fallback={null}>
        <LetterModel url={model.url} {...props} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

// Globe that rotates based on currentIndex
function LetterGlobe({
  models,
  currentIndex,
  isSpinning,
  spinSpeed,
  onCurrentIndexChange,
  showOnlyCurrentLetter,
  onFocusIndexChange,
  onModelLoaded,
  onModelError
}) {
  const globeRef = useRef();
  const targetRotation = useRef(0);
  const currentRotation = useRef(0);
  const prevSpinning = useRef(isSpinning);
  const lastFocusIndex = useRef(currentIndex);

  // Ensure models are placed in strict alphabetical order by letter
  const sortedModels = React.useMemo(() => {
    return [...models].sort((a, b) => a.letter.localeCompare(b.letter));
  }, [models]);

  const points = React.useMemo(() => {
    return equatorPoints(sortedModels.length);
  }, [sortedModels.length]);

  const normalizeAngle = useCallback((angle) => {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, 2 * Math.PI) - Math.PI;
  }, []);

  const frontOffset = 0;

  const computeFrontIndex = useCallback(() => {
    if (!globeRef.current) return currentIndex;
    const frontAngle = normalizeAngle(-globeRef.current.rotation.y + frontOffset);
    let bestIndex = 0;
    let bestDiff = Infinity;

    points.forEach((point, i) => {
      const diff = Math.abs(normalizeAngle(point.phi - frontAngle));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    });

    return bestIndex;
  }, [currentIndex, normalizeAngle, points]);

  useFrame(() => {
    if (!globeRef.current || !onFocusIndexChange) return;
    const focusIndex = computeFrontIndex();
    if (focusIndex !== lastFocusIndex.current) {
      lastFocusIndex.current = focusIndex;
      onFocusIndexChange(focusIndex);
    }
  });

  useEffect(() => {
    if (sortedModels.length === 0) return;
    const phi = (2 * Math.PI * currentIndex) / Math.max(sortedModels.length, 1);
    targetRotation.current = frontOffset - phi;
  }, [currentIndex, sortedModels.length]);

  useEffect(() => {
    if (prevSpinning.current && !isSpinning && onCurrentIndexChange) {
      const nearestIndex = computeFrontIndex();
      if (nearestIndex !== currentIndex) {
        onCurrentIndexChange(nearestIndex);
      }
    }
    prevSpinning.current = isSpinning;
  }, [isSpinning, onCurrentIndexChange, computeFrontIndex, currentIndex]);

  useFrame((state, delta) => {
    if (!globeRef.current) return;
    if (isSpinning) {
      globeRef.current.rotation.y -= delta * spinSpeed;
      currentRotation.current = globeRef.current.rotation.y;
    } else {
      currentRotation.current = THREE.MathUtils.lerp(
        currentRotation.current,
        targetRotation.current,
        delta * 3
      );
      globeRef.current.rotation.y = currentRotation.current;
    }
  });

  if (sortedModels.length === 0) return null;

  return (
    <group ref={globeRef} position={[-1.3, 0, 0]}>
      {sortedModels.map((model, i) => (
        <LetterModelSlot
          key={model.letter}
          model={model}
          position={[points[i].x, points[i].y, points[i].z]}
          isActive={i === currentIndex && !isSpinning}
          index={i}
          totalLetters={sortedModels.length}
          showOnlyCurrentLetter={showOnlyCurrentLetter}
          onLoaded={() => onModelLoaded?.(model.letter)}
          onError={() => onModelError?.(model.letter)}
        />
      ))}
      {/* Wireframe sphere guide */}
      <mesh>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshBasicMaterial
          color="#00d4ff"
          wireframe
          transparent
          opacity={0.04}
        />
      </mesh>
    </group>
  );
}

// Particle ring around equator
function EquatorRing() {
  return null;
}

export default function GlobeView({ models }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(0.25);
  const [gesture, setGesture] = useState('NONE');
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [showOnlyCurrentLetter, setShowOnlyCurrentLetter] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isReturningToSetup, setIsReturningToSetup] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(10);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState(true);
  const [loadedLetters, setLoadedLetters] = useState(() => new Set());
  const [failedLetters, setFailedLetters] = useState(() => new Set());
  const setupTimeoutRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const lastGestureRef = useRef('NONE');
  const recentSwipeAt = useRef(0);

  const sortedModels = React.useMemo(() => sortModelsAlphabetically(models), [models]);
  const displayModelCount = Math.max(sortedModels.length, 1);

  const handleGesture = useCallback((detectedGesture) => {
    const now = performance.now();
    if (detectedGesture === 'SWIPE_LEFT' || detectedGesture === 'SWIPE_RIGHT') {
      recentSwipeAt.current = now;
    }

    if (
      (detectedGesture === 'FIST' || detectedGesture === 'SPIN') &&
      now - recentSwipeAt.current < 700
    ) {
      return;
    }

    setGesture(detectedGesture);
    if (detectedGesture === 'NONE') {
      lastGestureRef.current = 'NONE';
      setGestureConfidence(0);
      return;
    }

    if (detectedGesture === lastGestureRef.current) return;

    lastGestureRef.current = detectedGesture;
    setGestureConfidence(1);

    if (detectedGesture === 'SWIPE_LEFT') {
      setIsSpinning(false);
      setShowOnlyCurrentLetter(true);
      setCurrentIndex(prev => (prev + 1) % displayModelCount);
    } else if (detectedGesture === 'SWIPE_RIGHT') {
      setIsSpinning(false);
      setShowOnlyCurrentLetter(true);
      setCurrentIndex(prev => (prev - 1 + displayModelCount) % displayModelCount);
    } else if (detectedGesture === 'STOP' || detectedGesture === 'OPEN_PALM') {
      setIsSpinning(false);
      setShowOnlyCurrentLetter(true);
    } else if (detectedGesture === 'FIST' || detectedGesture === 'SPIN') {
      setShowOnlyCurrentLetter(false);
      setIsSpinning(true);
    }
  }, [displayModelCount]);

  const { videoRef, canvasRef, isReady, isHandDetected, numHandsDetected } = useHandGestures(handleGesture);

  useEffect(() => {
    if (numHandsDetected > 1) {
      setIsSpinning(false);
    }
  }, [numHandsDetected]);

  useEffect(() => {
    if (isSetupComplete || !isReady) return;
    
    if (numHandsDetected === 1) {
      if (!setupTimeoutRef.current) {
        setupTimeoutRef.current = setTimeout(() => {
          setIsSetupComplete(true);
        }, 2000);
      }
    } else {
      if (setupTimeoutRef.current) {
        clearTimeout(setupTimeoutRef.current);
        setupTimeoutRef.current = null;
      }
    }

    return () => {
      if (setupTimeoutRef.current) {
        clearTimeout(setupTimeoutRef.current);
      }
    };
  }, [numHandsDetected, isSetupComplete, isReady]);

  useEffect(() => {
    if (!autoRedirectEnabled || !isSetupComplete || numHandsDetected !== 0) {
      if (redirectTimerRef.current) {
        clearInterval(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      setIsReturningToSetup(false);
      setRedirectCountdown(10);
      return;
    }

    setIsReturningToSetup(true);

    if (redirectTimerRef.current) return;

    redirectTimerRef.current = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev <= 1) {
          if (redirectTimerRef.current) {
            clearInterval(redirectTimerRef.current);
            redirectTimerRef.current = null;
          }
          setIsReturningToSetup(false);
          setIsSetupComplete(false);
          setIsSpinning(false);
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (redirectTimerRef.current) {
        clearInterval(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [numHandsDetected, isSetupComplete, autoRedirectEnabled]);

  const goNext = () => setCurrentIndex(prev => (prev + 1) % displayModelCount);
  const goPrev = () => setCurrentIndex(prev => (prev - 1 + displayModelCount) % displayModelCount);
  const toggleSpin = () => setIsSpinning(s => !s);

  const displayIndex = focusedIndex;
  const currentLetter = sortedModels[displayIndex]?.letter || '?';
  const focusLetters = getFocusedAlphabetWindow(sortedModels, displayIndex, 5);

  const resolveUrl = (url) => normalizeModelUrl(url);

  const resolvedModels = sortedModels.map(m => ({ ...m, url: resolveUrl(m.url) }));
  const showMultiHandOverlay = isReady && numHandsDetected > 1;
  const modelsLoading = resolvedModels.length > 0 && loadedLetters.size < resolvedModels.length;
  const loadedCount = loadedLetters.size;
  const totalModelCount = resolvedModels.length;

  useEffect(() => {
    setLoadedLetters(new Set());
    setFailedLetters(new Set());
    sortedModels.forEach(model => {
      useGLTF.preload(normalizeModelUrl(model.url), undefined, undefined, gltfLoaderOptions);
    });
  }, [sortedModels]);

  const handleModelLoaded = useCallback((letter) => {
    setLoadedLetters(prev => {
      if (prev.has(letter)) return prev;
      const next = new Set(prev);
      next.add(letter);
      return next;
    });
  }, []);

  const handleModelError = useCallback((letter) => {
    setFailedLetters(prev => {
      if (prev.has(letter)) return prev;
      const next = new Set(prev);
      next.add(letter);
      return next;
    });
  }, []);

  return (
    <div className={`globe-container ${!isSetupComplete ? 'setup-mode' : ''}`}>
      {isReturningToSetup && (
        <div className="redirect-overlay" role="status" aria-live="polite">
          <div className="redirect-card">
            <div className="redirect-icon">👋</div>
            <div className="redirect-title">NO HANDS DETECTED</div>
            <div className="redirect-subtitle">
              Directing you back to the setup screen in {redirectCountdown} second{redirectCountdown === 1 ? '' : 's'}.
            </div>
            <div className="redirect-progress">
              <div className="redirect-progress-fill" style={{ width: `${(redirectCountdown / 10) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Setup Overlay Background */}
      {!isSetupComplete && (
        <div className="setup-overlay">
          <div className="setup-header">
            <h2 className="setup-title">TRACKING CALIBRATION</h2>
            <p className="setup-subtitle">Ensure exactly <strong>ONE</strong> hand is visible to the camera.</p>
            <div className={`setup-status-text ${!isReady ? 'loading' : numHandsDetected === 1 ? 'success' : 'error'}`}>
              {!isReady ? 'LOADING MODEL...' :
               numHandsDetected === 0 ? 'PLEASE SHOW ONE HAND' :
               numHandsDetected > 1 ? 'MULTIPLE HANDS DETECTED!' :
               'PERFECT! HOLD STEADY...'}
            </div>
            {numHandsDetected === 1 && (
              <div className="setup-timer-bar">
                <div className="setup-timer-fill" />
              </div>
            )}
          </div>

          <div className="setup-tutorial">
            <h3>HOW TO PLAY</h3>
            <div className="tutorial-steps">
              <div className="tutorial-step">
                <span className="tutorial-icon">✊</span>
                <span>Make a <strong>FIST</strong> to auto-spin</span>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-icon">✋</span>
                <span>Open your <strong>PALM</strong> to stop</span>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-icon">👈</span>
                <span><strong>SWIPE</strong> to switch letters</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model loading indicator */}
      {modelsLoading && (
        <div className="model-loading-overlay" role="status" aria-live="polite">
          <div className="model-loading-card">
            <div className="model-loading-title">LOADING 3D MODELS</div>
            <div className="model-loading-subtitle">
              {loadedCount} / {totalModelCount} letters ready
              {failedLetters.size > 0 ? ` · ${failedLetters.size} failed` : ''}
            </div>
            <div className="model-loading-progress">
              <div
                className="model-loading-progress-fill"
                style={{ width: `${(loadedCount / totalModelCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [-0.9, 0, 8], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-5, 3, -5]} intensity={0.8} color="#1a4fff" />
        <pointLight position={[5, -3, 5]} intensity={0.6} color="#ff6b35" />

        {resolvedModels.length > 0 && (
          <LetterGlobe
            models={resolvedModels}
            currentIndex={currentIndex}
            isSpinning={isSpinning}
            spinSpeed={spinSpeed}
            onCurrentIndexChange={setCurrentIndex}
            onFocusIndexChange={setFocusedIndex}
            showOnlyCurrentLetter={showOnlyCurrentLetter}
            onModelLoaded={handleModelLoaded}
            onModelError={handleModelError}
          />
        )}
        <EquatorRing />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={5}
          maxDistance={14}
          autoRotate={false}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>

      {showMultiHandOverlay && (
        <div className="multi-hand-overlay" role="alert">
          <div className="multi-hand-card">
            <div className="multi-hand-icon">✋✋</div>
            <div className="multi-hand-title">MULTIPLE HANDS DETECTED</div>
            <div className="multi-hand-subtitle">Please show only one hand for the best experience.</div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedModels.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <p className="empty-title">No Models Loaded</p>
          <p className="empty-sub">Upload GLB files in the Admin panel to begin</p>
        </div>
      )}

      {/* Left focus panel */}
      {sortedModels.length > 0 && (
        <div className="focus-panel">
          <div className="focus-panel-title">FOCUS</div>
          <div className="focus-panel-current">{currentLetter}</div>
          <div className="focus-panel-letters">
            {focusLetters.map((letter, index) => {
              const isCenter = index === Math.floor(focusLetters.length / 2);
              return (
                <div key={`${letter}-${index}`} className={`focus-letter ${isCenter ? 'active' : ''}`}>
                  {letter}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HUD — current letter */}
      {sortedModels.length > 0 && (
        <div className="letter-hud">
          <div className="letter-display">{currentLetter}</div>
          <div className="letter-index">{displayIndex + 1} / {sortedModels.length}</div>
          {isSpinning && <div className="spin-badge">● AUTO SPIN</div>}
        </div>
      )}

      {/* Gesture HUD */}
      <div className="gesture-hud">
        <div className={`gesture-status ${!isReady ? 'loading' : numHandsDetected > 1 ? 'error' : isHandDetected ? 'ready' : 'not-detected'}`}>
          <div className="gesture-dot" />
          <span>{!isReady ? 'LOADING HAND TRACKER...' : numHandsDetected > 1 ? 'MULTIPLE HANDS' : isHandDetected ? 'HAND DETECTED' : 'HAND NOT DETECTED'}</span>
        </div>

        {gesture && gesture !== 'NONE' && gesture !== 'OPEN_PALM' && gesture !== 'FIST' && gesture !== 'SPIN' && (
          <div className="gesture-indicator">
            <div className="gesture-name">{gesture.replace('_', ' ')}</div>
            <div className="gesture-bar">
              <div className="gesture-fill" style={{ width: `${gestureConfidence * 100}%` }} />
            </div>
          </div>
        )}

        {/* Webcam preview */}
        <div className="webcam-preview">
          <video ref={videoRef} style={{ display: 'none' }} />
          <canvas ref={canvasRef} width={260} height={195} />
        </div>

        <div className="gesture-guide">
          <div className="guide-title">HOW TO CONTROL</div>
          <div className="guide-subtitle">Use your hand in front of the camera to move the globe.</div>
          <div className="guide-items">
            <div className="guide-item">
              <span className="guide-icon">👈</span>
              <span>Swipe Left to move to the next letter.</span>
            </div>
            <div className="guide-item">
              <span className="guide-icon">👉</span>
              <span>Swipe Right to move to the previous letter.</span>
            </div>
            <div className="guide-item">
              <span className="guide-icon">✋</span>
              <span>Open Palm to stop and highlight the current letter.</span>
            </div>
            <div className="guide-item">
              <span className="guide-icon">✊</span>
              <span>Fist to start auto spin and keep the globe moving.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Controls */}
      <div className="manual-controls">
        <button className="ctrl-btn" onClick={goPrev}>◀ PREV</button>
        <button className={`ctrl-btn spin-btn ${isSpinning ? 'active' : ''}`} onClick={toggleSpin}>
          {isSpinning ? '⏸ STOP' : '▶ SPIN'}
        </button>
        <button className="ctrl-btn" onClick={goNext}>NEXT ▶</button>
        <button className={`ctrl-btn ${autoRedirectEnabled ? 'active' : ''}`} onClick={() => setAutoRedirectEnabled(prev => !prev)}>
          {autoRedirectEnabled ? '⏱ AUTO REDIRECT ON' : '⏱ AUTO REDIRECT OFF'}
        </button>
        <button className="ctrl-btn" onClick={() => { setIsSetupComplete(false); setIsSpinning(false); }}>🔄 RECALIBRATE</button>
      </div>
    </div>
  );
}
