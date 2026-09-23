import { useCallback, useEffect, useState } from 'react';
import type { AppSection } from '../components/AppNavigation';

const DEFAULT_SECTION: AppSection = 'workspace';
const VALID_SECTIONS = new Set<AppSection>(['workspace', 'import', 'review', 'explore', 'database']);

export function sectionFromHash(hash: string): AppSection {
  const candidate = hash.replace(/^#\/?/, '').split(/[/?]/, 1)[0] as AppSection;
  return VALID_SECTIONS.has(candidate) ? candidate : DEFAULT_SECTION;
}

export function hashForSection(section: AppSection): string {
  return `#/${section}`;
}

export function useHashSection(): readonly [AppSection, (section: AppSection) => void] {
  const [section, setSection] = useState<AppSection>(() => sectionFromHash(window.location.hash));

  useEffect(() => {
    const syncFromHash = () => setSection(sectionFromHash(window.location.hash));
    window.addEventListener('hashchange', syncFromHash);

    if (!window.location.hash) {
      window.history.replaceState(null, '', hashForSection(DEFAULT_SECTION));
    }

    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const navigate = useCallback((next: AppSection) => {
    const nextHash = hashForSection(next);
    if (window.location.hash === nextHash) return;
    window.location.hash = nextHash;
  }, []);

  return [section, navigate] as const;
}
