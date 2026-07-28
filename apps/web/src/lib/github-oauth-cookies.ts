export const GITHUB_OAUTH_COOKIES = {
  installation: 'aws_github_installation',
  project: 'aws_github_project',
  state: 'aws_github_state',
  verifier: 'aws_github_verifier',
} as const;

export const GITHUB_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
