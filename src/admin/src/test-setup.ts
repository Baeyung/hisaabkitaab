/**
 * Node 26 declares a `localStorage` global that stays undefined unless the process is started
 * with --localstorage-file, and it shadows the working one jsdom would otherwise install
 * (sessionStorage, which Node does not declare, comes through fine). Anything reading a saved
 * sign-in would blow up on import, so stand in a Map-backed one for tests.
 */
if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    } satisfies Storage,
  });
}
