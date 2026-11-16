import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpOptions {
  host: string;
  port: number;
  from: string;
  /** SMTP login, for providers that need one (Scaleway TEM, ENG-25). Mailpit locally needs none. */
  user?: string;
  password?: string;
}

/** Transport options: TLS from the start on port 465, STARTTLS required on other ports whenever we log in. */
export function smtpTransportOptions(options: SmtpOptions) {
  const auth = options.user ? { user: options.user, pass: options.password ?? '' } : undefined;
  return { host: options.host, port: options.port, secure: options.port === 465, requireTLS: Boolean(auth) && options.port !== 465, auth };
}

/** Sends through an SMTP server: Mailpit locally, Scaleway TEM in staging and production. */
export function smtpMailer(options: SmtpOptions): Mailer {
  const transport = nodemailer.createTransport(smtpTransportOptions(options));
  return {
    async send(message) {
      await transport.sendMail({ from: options.from, ...message });
    },
  };
}
