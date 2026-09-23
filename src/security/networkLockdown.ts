const blocked = (name: string) => () => {
  throw new Error(`Network capability disabled by Ragtime 5500 security policy: ${name}`);
};

export function installNetworkLockdown(): void {
  const g = globalThis as unknown as Record<string, unknown>;

  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) {
    try {
      Object.defineProperty(g, name, {
        configurable: false,
        writable: false,
        value: blocked(name),
      });
    } catch {
      // CSP remains the mandatory enforcement layer if a host object is non-configurable.
    }
  }

  try {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: false,
      writable: false,
      value: blocked('navigator.sendBeacon'),
    });
  } catch {
    // Same rationale as above.
  }
}
