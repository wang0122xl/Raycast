import nodemailer from "nodemailer";
import { getPreferenceValues } from "@raycast/api";

const NETEASE_SMTP_HOST = "smtp.163.com";
const NETEASE_SMTP_PORT = 465;

function createTransporter(): nodemailer.Transporter {
  const prefs = getPreferenceValues<Preferences>();
  return nodemailer.createTransport({
    host: NETEASE_SMTP_HOST,
    port: NETEASE_SMTP_PORT,
    secure: true,
    auth: {
      user: prefs.username,
      pass: prefs.password,
    },
  });
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  const transporter = createTransporter();

  await transporter.sendMail({
    from: prefs.username,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
    html: options.html,
    inReplyTo: options.inReplyTo,
    references: options.references,
  });
}
