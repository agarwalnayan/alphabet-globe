import { sortModelsAlphabetically } from '../globeUtils';

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
