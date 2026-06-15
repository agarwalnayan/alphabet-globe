export function equatorPoints(n, radius = 3.2) {
  const points = [];

  for (let i = 0; i < n; i++) {
    // Start at -PI/2 so that i=0 is at front (z = radius)
    // Actually, we'll let the GlobeView handle rotation, just space them evenly on equator
    const phi = (2 * Math.PI * i) / n;

    points.push({
      x: radius * Math.sin(phi),
      y: 0, // Keep them strictly on the equator
      z: radius * Math.cos(phi),
      phi,
    });
  }

  return points;
}

export function getFocusedAlphabetWindow(models = [], focusIndex = 0, windowSize = 5) {
  const sortedModels = sortModelsAlphabetically(models);
  const total = sortedModels.length;

  if (total === 0) return [];

  const safeIndex = ((focusIndex % total) + total) % total;
  const halfWindow = Math.floor(windowSize / 2);
  const startIndex = (safeIndex - halfWindow + total) % total;

  return Array.from({ length: Math.min(windowSize, total) }, (_, offset) => {
    const index = (startIndex + offset + total) % total;
    return sortedModels[index]?.letter || '?';
  });
}

export function sortModelsAlphabetically(models = []) {
  return [...models].sort((a, b) => {
    const leftLetter = a?.letter ?? '';
    const rightLetter = b?.letter ?? '';
    return leftLetter.localeCompare(rightLetter, undefined, { sensitivity: 'base' });
  });
}
