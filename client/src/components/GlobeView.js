import React, { useRef, useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Stars } from '@react-three/drei';
import * as THREE from 'three';
import useHandGestures from '../hooks/useHandGestures';
import { sortModelsAlphabetically } from './globeUtils';
import './GlobeView.css';

// Distribute N points on a sphere (Fibonacci spiral)
function fibonacciSpherePoints(n, radius = 3.2) {
  // Fibonacci-style elevation (theta) but use a negative phi progression so
  // the letters advance in the same direction the UI expects as the index increases.
  const points = [];
  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
    const phi = -(2 * Math.PI * i) / n;
    points.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.cos(theta),
      z: radius * Math.sin(theta) * Math.sin(phi),
      phi,
    });
  }
  return points;
}

// Single letter model on the globe
function LetterModel({ url, position, isActive, index, totalLetters, showOnlyCurrentLetter }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef();
  const clonedScene = scene.clone(true);
  const targetPosRef = useRef(position);

  // Normalize material
  clonedScene.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const targetScale = showOnlyCurrentLetter && isActive ? 2.5 : (isActive ? 1.6 : 0.55);
  const currentScale = useRef(targetScale);
  const shouldShow = !showOnlyCurrentLetter || isActive;

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Smooth scale transition + gentle pulsing for fun
    currentScale.current = THREE.MathUtils.lerp(
      currentScale.current,
      targetScale,
      delta * 6
    );
    const pulse = 1 + 0.06 * Math.sin(state.clock.elapsedTime * 2 + index);
    groupRef.current.scale.setScalar(currentScale.current * pulse);

    // Center the letter when showing only current
    if (showOnlyCurrentLetter && isActive) {
      groupRef.current.position.lerp(new THREE.Vector3(0, 0, 0), delta * 5);
    } else {
      const targetPos = new THREE.Vector3(...position);
      groupRef.current.position.lerp(targetPos, delta * 5);
    }

    // Spin active letter slowly
    if (isActive) {
      groupRef.current.rotation.y += delta * 0.8;
    }
  });

  // Opacity by distance from "front" or hide if not showing
  if (!shouldShow) {
    return <group ref={groupRef} position={position} />;
  }

  const frontPos = new THREE.Vector3(0, 0, 3.2);
  const pos3 = new THREE.Vector3(...position);
  const dist = pos3.distanceTo(frontPos);
  const opacity = showOnlyCurrentLetter && isActive ? 1 : Math.max(0.15, 1 - dist / 7);

  const hue = Math.round((index / Math.max(totalLetters, 1)) * 360);

  return (
    <group ref={groupRef} position={position}>
      <primitive
        object={clonedScene}
        scale={1}
        style={{ opacity }}
      />
      {isActive && (
        <pointLight intensity={3} distance={2.5} color={`hsl(${hue},80%,60%)`} />
      )}
    </group>
  );
}

// Globe that rotates based on currentIndex
function LetterGlobe({ models, currentIndex, isSpinning, spinSpeed, onCurrentIndexChange, showOnlyCurrentLetter, onFocusIndexChange }) {
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
    return fibonacciSpherePoints(sortedModels.length);
  }, [sortedModels.length]);

  const normalizeAngle = useCallback((angle) => {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, 2 * Math.PI) - Math.PI;
  }, []);

  const frontOffset = Math.PI / 2;

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
      globeRef.current.rotation.y += delta * spinSpeed;
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
        <LetterModel
          key={model.letter}
          url={model.url}
          position={[points[i].x, points[i].y, points[i].z]}
          isActive={i === currentIndex && !isSpinning}
          index={i}
          totalLetters={sortedModels.length}
          showOnlyCurrentLetter={showOnlyCurrentLetter}
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
  const [spinSpeed, setSpinSpeed] = useState(0.8);
  const [gesture, setGesture] = useState('NONE');
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [showOnlyCurrentLetter, setShowOnlyCurrentLetter] = useState(false);
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

  const { videoRef, canvasRef, isReady } = useHandGestures(handleGesture);

  const goNext = () => setCurrentIndex(prev => (prev + 1) % displayModelCount);
  const goPrev = () => setCurrentIndex(prev => (prev - 1 + displayModelCount) % displayModelCount);
  const toggleSpin = () => setIsSpinning(s => !s);

  const displayIndex = isSpinning ? focusedIndex : currentIndex;
  const currentLetter = sortedModels[displayIndex]?.letter || '?';

  const resolveUrl = (url) => {
    if (url.startsWith('http')) return url;
    return url; // CRA proxy handles it
  };

  const resolvedModels = sortedModels.map(m => ({ ...m, url: resolveUrl(m.url) }));

  return (
    <div className="globe-container">
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

        <Suspense fallback={null}>
          {resolvedModels.length > 0 && (
            <LetterGlobe
              models={resolvedModels}
              currentIndex={currentIndex}
              isSpinning={isSpinning}
              spinSpeed={spinSpeed}
              onCurrentIndexChange={setCurrentIndex}
              onFocusIndexChange={setFocusedIndex}
              showOnlyCurrentLetter={showOnlyCurrentLetter}
            />
          )}
          <EquatorRing />
        </Suspense>

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

      {/* Empty state */}
      {sortedModels.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <p className="empty-title">No Models Loaded</p>
          <p className="empty-sub">Upload GLB files in the Admin panel to begin</p>
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
        <div className={`gesture-status ${isReady ? 'ready' : 'loading'}`}>
          <div className="gesture-dot" />
          <span>{isReady ? 'HAND TRACKING ACTIVE' : 'LOADING HAND TRACKER...'}</span>
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
      </div>
    </div>
  );
}
