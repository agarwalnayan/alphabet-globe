import React, { useRef, useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Stars } from '@react-three/drei';
import * as THREE from 'three';
import useHandGestures from '../hooks/useHandGestures';
import './GlobeView.css';

// Distribute N points on a sphere (Fibonacci spiral)
function fibonacciSpherePoints(n, radius = 3.2) {
  const points = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
    const phi = (2 * Math.PI * i) / goldenRatio;
    points.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.cos(theta),
      z: radius * Math.sin(theta) * Math.sin(phi),
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
    
    // Smooth scale transition
    currentScale.current = THREE.MathUtils.lerp(
      currentScale.current,
      targetScale,
      delta * 6
    );
    groupRef.current.scale.setScalar(currentScale.current);

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

  return (
    <group ref={groupRef} position={position}>
      <primitive
        object={clonedScene}
        scale={1}
        style={{ opacity }}
      />
      {isActive && (
        <pointLight intensity={3} distance={2.5} color="#00d4ff" />
      )}
    </group>
  );
}

// Globe that rotates based on currentIndex
function LetterGlobe({ models, currentIndex, isSpinning, spinSpeed, onCurrentIndexChange, showOnlyCurrentLetter }) {
  const globeRef = useRef();
  const targetRotation = useRef(0);
  const currentRotation = useRef(0);
  const prevSpinning = useRef(isSpinning);

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const points = React.useMemo(() => {
    return fibonacciSpherePoints(models.length).map((point, i) => ({
      ...point,
      phi: (2 * Math.PI * i) / goldenRatio,
    }));
  }, [models.length, goldenRatio]);

  const normalizeAngle = useCallback((angle) => {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, 2 * Math.PI) - Math.PI;
  }, []);

  const computeFrontIndex = useCallback(() => {
    if (!globeRef.current) return currentIndex;
    const frontAngle = normalizeAngle(-globeRef.current.rotation.y);
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

  useEffect(() => {
    if (models.length === 0) return;
    const phi = (2 * Math.PI * currentIndex) / goldenRatio;
    targetRotation.current = -phi;
  }, [currentIndex, models.length, goldenRatio]);

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

  if (models.length === 0) return null;

  return (
    <group ref={globeRef}>
      {models.map((model, i) => (
        <LetterModel
          key={model.letter}
          url={model.url}
          position={[points[i].x, points[i].y, points[i].z]}
          isActive={i === currentIndex && !isSpinning}
          index={i}
          totalLetters={models.length}
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
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(0.8);
  const [gesture, setGesture] = useState('NONE');
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [showOnlyCurrentLetter, setShowOnlyCurrentLetter] = useState(false);
  const lastGestureRef = useRef('NONE');

  const handleGesture = useCallback((detectedGesture) => {
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
      setCurrentIndex(prev => (prev + 1) % Math.max(models.length, 1));
    } else if (detectedGesture === 'SWIPE_RIGHT') {
      setIsSpinning(false);
      setShowOnlyCurrentLetter(true);
      setCurrentIndex(prev => (prev - 1 + Math.max(models.length, 1)) % Math.max(models.length, 1));
    } else if (detectedGesture === 'STOP' || detectedGesture === 'OPEN_PALM') {
      setIsSpinning(false);
      setShowOnlyCurrentLetter(true);
    } else if (detectedGesture === 'FIST' || detectedGesture === 'SPIN') {
      setShowOnlyCurrentLetter(false);
      setIsSpinning(true);
    }
  }, [models.length]);

  const { videoRef, canvasRef, isReady } = useHandGestures(handleGesture);

  const goNext = () => setCurrentIndex(prev => (prev + 1) % Math.max(models.length, 1));
  const goPrev = () => setCurrentIndex(prev => (prev - 1 + Math.max(models.length, 1)) % Math.max(models.length, 1));
  const toggleSpin = () => setIsSpinning(s => !s);

  const currentLetter = models[currentIndex]?.letter || '?';

  const resolveUrl = (url) => {
  if (url.startsWith('http')) return url;
  return url; // CRA proxy handles it
};

  const resolvedModels = models.map(m => ({ ...m, url: resolveUrl(m.url) }));

  return (
    <div className="globe-container">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'radial-gradient(ellipse at center, #001428 0%, #000810 70%, #000000 100%)' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-5, 3, -5]} intensity={0.8} color="#1a4fff" />
        <pointLight position={[5, -3, 5]} intensity={0.6} color="#ff6b35" />

        <Stars radius={100} depth={50} count={3000} factor={3} fade speed={0.5} />

        <Suspense fallback={null}>
          {resolvedModels.length > 0 && (
            <LetterGlobe
              models={resolvedModels}
              currentIndex={currentIndex}
              isSpinning={isSpinning}
              spinSpeed={spinSpeed}
              onCurrentIndexChange={setCurrentIndex}
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
      {models.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <p className="empty-title">No Models Loaded</p>
          <p className="empty-sub">Upload GLB files in the Admin panel to begin</p>
        </div>
      )}

      {/* HUD — current letter */}
      {models.length > 0 && (
        <div className="letter-hud">
          <div className="letter-display">{currentLetter}</div>
          <div className="letter-index">{currentIndex + 1} / {models.length}</div>
          {isSpinning && <div className="spin-badge">● AUTO SPIN</div>}
        </div>
      )}

      {/* Gesture HUD */}
      <div className="gesture-hud">
        <div className={`gesture-status ${isReady ? 'ready' : 'loading'}`}>
          <div className="gesture-dot" />
          <span>{isReady ? 'HAND TRACKING ACTIVE' : 'LOADING HAND TRACKER...'}</span>
        </div>

        {gesture && gesture !== 'NONE' && (
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
          <canvas ref={canvasRef} width={180} height={135} />
        </div>
      </div>

      {/* Gesture Guide */}
      <div className="gesture-guide">
        <div className="guide-title">GESTURES</div>
        <div className="guide-items">
          <div className="guide-item">
            <span className="guide-icon">👈</span>
            <span>Swipe Left → Next</span>
          </div>
          <div className="guide-item">
            <span className="guide-icon">👉</span>
            <span>Swipe Right → Prev</span>
          </div>
          <div className="guide-item">
            <span className="guide-icon">✋</span>
            <span>Open Palm → <span className="guide-stop">Stop</span></span>
          </div>
          <div className="guide-item">
            <span className="guide-icon">✊</span>
            <span>Fist → Auto Spin</span>
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
