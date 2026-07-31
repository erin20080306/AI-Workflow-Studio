const PRODUCTION_CONTROL_PLANE_ORIGIN = 'https://www.erin-aiworkflowstudio.com';

function validControlPlaneOrigin(input: string | undefined): string | undefined {
  if (input === undefined || input.trim() === '') return undefined;
  try {
    const url = new URL(input.trim());
    const localhost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) return undefined;
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function defaultControlPlaneOrigin(
  configuredOrigin: string | undefined = import.meta.env.VITE_CONTROL_PLANE_ORIGIN,
): string {
  return validControlPlaneOrigin(configuredOrigin) ?? PRODUCTION_CONTROL_PLANE_ORIGIN;
}
