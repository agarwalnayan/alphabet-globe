import { fibonacciSpherePoints, getFocusedAlphabetWindow, sortModelsAlphabetically } from '../globeUtils';

describe('fibonacciSpherePoints', () => {
  it('uses a positive angular progression around the globe', () => {
    const points = fibonacciSpherePoints(4);

    expect(points[0].phi).toBe(0);
    expect(points[1].phi).toBe(Math.PI / 2);
    expect(points[2].phi).toBe(Math.PI);
    expect(points[3].phi).toBe((3 * Math.PI) / 2);
  });
});

describe('getFocusedAlphabetWindow', () => {
  it('returns the centered alphabet sequence for the current focus index', () => {
    const models = [
      { letter: 'A', url: '/a.glb' },
      { letter: 'B', url: '/b.glb' },
      { letter: 'C', url: '/c.glb' },
      { letter: 'D', url: '/d.glb' },
      { letter: 'E', url: '/e.glb' },
    ];

    expect(getFocusedAlphabetWindow(models, 2, 5)).toEqual(['E', 'D', 'C', 'B', 'A']);
  });
});

describe('sortModelsAlphabetically', () => {
  it('orders models by letter in alphabetical order', () => {
    const models = [
      { letter: 'Z', url: '/z.glb' },
      { letter: 'A', url: '/a.glb' },
      { letter: 'M', url: '/m.glb' },
    ];

    expect(sortModelsAlphabetically(models).map(model => model.letter)).toEqual(['A', 'M', 'Z']);
  });

  it('preserves the original model data while sorting', () => {
    const models = [
      { letter: 'C', url: '/c.glb' },
      { letter: 'A', url: '/a.glb' },
      { letter: 'B', url: '/b.glb' },
    ];

    const sorted = sortModelsAlphabetically(models);

    expect(sorted[0]).toEqual({ letter: 'A', url: '/a.glb' });
    expect(sorted[2]).toEqual({ letter: 'C', url: '/c.glb' });
  });
});
