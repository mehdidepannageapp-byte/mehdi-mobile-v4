// Le vrai module 'react-native' contient une syntaxe Flow que le pipeline Vite/Rollup de Vitest
// ne peut pas analyser. On l'alias vers ce doublage minimal pour les tests de logique métier.
export const Platform = {
  OS: 'ios' as const,
  select: <T,>(options: Record<string, T>) => options.ios,
};
