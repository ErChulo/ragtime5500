export const APP_VERSION = '0.2.0-rc.1';
export const APP_CHANNEL = 'Milestone 2 metadata extraction candidate';

export function versionedArtifactName(stem: string, extension: string, dated = true): string {
  const date = dated ? `-${new Date().toISOString().slice(0, 10)}` : '';
  const cleanExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return `${stem}-v${APP_VERSION}${date}${cleanExtension}`;
}
