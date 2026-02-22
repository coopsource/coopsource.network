export { getGitHubAuthUrl, exchangeGitHubCode, getGitHubUser } from './github.js';
export { getGoogleAuthUrl, exchangeGoogleCode, getGoogleUser } from './google.js';

import type { AppConfig } from '../../config.js';

export type SupportedService = 'github' | 'google';

export function isServiceConfigured(
  service: SupportedService,
  config: AppConfig,
): boolean {
  switch (service) {
    case 'github':
      return !!(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
    case 'google':
      return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
    default:
      return false;
  }
}

export function getConfiguredServices(config: AppConfig): SupportedService[] {
  const services: SupportedService[] = [];
  if (isServiceConfigured('github', config)) services.push('github');
  if (isServiceConfigured('google', config)) services.push('google');
  return services;
}
