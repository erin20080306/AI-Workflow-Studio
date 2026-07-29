import { describe, expect, it } from 'vitest';

import {
  WebsiteDataFieldSchema,
  WebsiteDataMutationSchema,
  WebsitePublicDataSubmissionSchema,
} from './data';

describe('website custom data schemas', () => {
  it('accepts only bounded declarative field types', () => {
    expect(
      WebsiteDataFieldSchema.safeParse({
        key: 'customer',
        label: '客戶',
        options: [],
        referenceCollectionKey: 'customers',
        required: true,
        type: 'reference',
      }).success,
    ).toBe(true);
    expect(
      WebsiteDataFieldSchema.safeParse({
        key: 'script',
        label: 'Script',
        options: [],
        referenceCollectionKey: null,
        required: false,
        type: 'javascript',
      }).success,
    ).toBe(false);
  });

  it('requires review for schemas and explicit confirmation for deletion', () => {
    expect(
      WebsiteDataMutationSchema.safeParse({
        action: 'upsert-collection',
        collectionKey: 'bookings',
        confirmed: false,
        fields: [
          {
            key: 'name',
            label: '姓名',
            options: [],
            referenceCollectionKey: null,
            required: true,
            type: 'text',
          },
        ],
        name: '預約',
      }).success,
    ).toBe(false);
    expect(
      WebsiteDataMutationSchema.safeParse({
        action: 'delete-record',
        collectionKey: 'bookings',
        confirmed: false,
        expectedVersion: 1,
        idempotencyKey: crypto.randomUUID(),
        recordId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it('rejects executable or oversized public values', () => {
    expect(
      WebsitePublicDataSubmissionSchema.safeParse({
        formKey: 'booking-form',
        idempotencyKey: crypto.randomUUID(),
        pageSlug: 'booking',
        values: { name: '陳小姐', seats: 2 },
        website: '',
      }).success,
    ).toBe(true);
    expect(
      WebsitePublicDataSubmissionSchema.safeParse({
        formKey: 'booking-form',
        idempotencyKey: crypto.randomUUID(),
        pageSlug: 'booking',
        values: { command: { shell: 'rm -rf /' } },
      }).success,
    ).toBe(false);
  });
});
