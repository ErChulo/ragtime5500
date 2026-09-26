export const APP_VERSION = '0.1.1-test.3';
export const APP_CHANNEL = 'Milestone 1 stable test';

export function versionedArtifactName(stem: string, extension: string, dated = true): string {
  const date = dated ? `-${new Date().toISOString().slice(0, 10)}` : '';
  const cleanExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return `${stem}-v${APP_VERSION}${date}${cleanExtension}`;
}
