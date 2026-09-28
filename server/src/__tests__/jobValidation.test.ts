import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateJobInput } from '../utils/jobValidation.js';

describe('validateJobInput', () => {
  it('accepts valid email payloads', () => {
    const result = validateJobInput('email', {
      to: 'user@example.com',
      subject: 'Welcome',
      message: 'Hello',
    });

    assert.equal(result.ok, true);
  });

  it('rejects missing email fields', () => {
    const result = validateJobInput('email', {
      to: 'user@example.com',
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /to, subject, and message/i);
  });

  it('accepts valid pdf payloads', () => {
    const result = validateJobInput('pdf', {
      content: 'Some PDF content',
    });

    assert.equal(result.ok, true);
  });

  it('rejects unrecognized job types', () => {
    const result = validateJobInput('unknown', {});

    assert.equal(result.ok, false);
    assert.match(result.message, /email.*pdf/i);
  });
});
