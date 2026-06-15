export function sortModelsAlphabetically(models = []) {
  return [...models].sort((a, b) => {
    const leftLetter = a?.letter ?? '';
    const rightLetter = b?.letter ?? '';
    return leftLetter.localeCompare(rightLetter, undefined, { sensitivity: 'base' });
  });
}
