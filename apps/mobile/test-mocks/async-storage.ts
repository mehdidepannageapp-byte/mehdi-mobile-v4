let store: Record<string, string> = {};

const AsyncStorage = {
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
  removeItem: async (key: string) => { delete store[key]; },
  clear: async () => { store = {}; },
};

export default AsyncStorage;
