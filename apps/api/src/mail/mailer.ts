import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Sends through an SMTP server: Mailpit locally, the EU email provider in staging and production. */
export function smtpMailer(options: { host: string; port: number; from: string }): Mailer {
  const transport = nodemailer.createTransport({ host: options.host, port: options.port, secure: options.port === 465 });
  return {
    async send(message) {
      await transport.sendMail({ from: options.from, ...message });
    },
  };
}
