import { describe, expect, it } from 'vitest';
import { smtpTransportOptions } from './mailer.js';

describe('smtpTransportOptions', () => {
  it('sends without a login and without TLS to a local catcher', () => {
    expect(smtpTransportOptions({ host: 'localhost', port: 1025, from: 'x' })).toEqual({
      host: 'localhost',
      port: 1025,
      secure: false,
      requireTLS: false,
      auth: undefined,
    });
  });

  it('logs in over STARTTLS on port 587 and never sends the password in clear', () => {
    const options = smtpTransportOptions({ host: 'smtp.tem.scaleway.com', port: 587, from: 'x', user: 'project-id', password: 'secret' });
    expect(options).toMatchObject({ secure: false, requireTLS: true, auth: { user: 'project-id', pass: 'secret' } });
  });

  it('uses TLS from the start on port 465', () => {
    expect(smtpTransportOptions({ host: 'smtp.tem.scaleway.com', port: 465, from: 'x', user: 'u', password: 'p' })).toMatchObject({
      secure: true,
      requireTLS: false,
    });
  });
});
