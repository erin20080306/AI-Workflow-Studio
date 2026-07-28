import { describe, expect, it } from 'vitest';

import {
  buildRoutingDnsRecord,
  customerHostnameFromHost,
  isAnyPublishedWebsiteAssetPath,
  normalizeCustomerHostname,
  websiteCustomDomainRewritePath,
  websiteCustomDomainUrl,
} from './website-custom-domain';

describe('website customer custom domains', () => {
  it('normalizes a customer-owned hostname and removes a trailing root dot', () => {
    expect(normalizeCustomerHostname('  WWW.Customer-Domain.com. ')).toBe(
      'www.customer-domain.com',
    );
    expect(customerHostnameFromHost('www.customer-domain.com:443')).toBe('www.customer-domain.com');
  });

  it.each([
    'https://customer.example.com',
    'customer.example.com/path',
    '127.0.0.1',
    'localhost',
    'customer.local',
    'customer.invalid',
    'erin-aiworkflowstudio.com',
    'www.erin-aiworkflowstudio.com',
    'customer.vercel.app',
    '*.customer.com',
    '-customer.com',
  ])('rejects unsafe or platform-owned hostname %s', (hostname) => {
    expect(() => normalizeCustomerHostname(hostname)).toThrow('CUSTOM_DOMAIN_INVALID');
  });

  it('rewrites custom-host pages while keeping the hostname explicit', () => {
    expect(websiteCustomDomainRewritePath('www.customer.com', '/')).toBe('/d/www.customer.com');
    expect(websiteCustomDomainRewritePath('www.customer.com', '/services')).toBe(
      '/d/www.customer.com/services',
    );
    expect(websiteCustomDomainUrl('www.customer.com')).toBe('https://www.customer.com');
  });

  it('uses an A record for an apex and CNAME for a subdomain', () => {
    expect(
      buildRoutingDnsRecord({
        apexName: 'customer.com',
        hostname: 'customer.com',
        recommendedIpv4: '192.0.2.10',
      }),
    ).toEqual({
      name: 'customer.com',
      purpose: 'routing',
      type: 'A',
      value: '192.0.2.10',
    });
    expect(
      buildRoutingDnsRecord({
        apexName: 'customer.com',
        hostname: 'www.customer.com',
        recommendedCname: 'cname.example.net',
      }),
    ).toEqual({
      name: 'www.customer.com',
      purpose: 'routing',
      type: 'CNAME',
      value: 'cname.example.net',
    });
  });

  it('allows only bounded public website asset paths outside the page rewrite', () => {
    expect(
      isAnyPublishedWebsiteAssetPath('/api/public-sites/customer-site-a45676dc/assets/hero-art'),
    ).toBe(true);
    expect(isAnyPublishedWebsiteAssetPath('/api/public-sites/customer-site/assets/../secret')).toBe(
      false,
    );
    expect(isAnyPublishedWebsiteAssetPath('/api/private/assets/hero-art')).toBe(false);
  });
});
