import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export type EmailType = 'reminder' | 'deadline_warning' | 'confirmation' | 'declined' | 'at_risk_summary'

interface SendEmailOptions {
  to: string
  memberName: string
  semesterName: string
  deadline?: string
  submitUrl?: string
  type: EmailType
  declineReason?: string
  atRiskMembers?: { name: string; gpa: number }[]
  threshold?: number
}

const SUBJECTS: Record<EmailType, (s: string) => string> = {
  reminder:          (s) => `Grade Submission Open — ${s}`,
  deadline_warning:  (s) => `⚠️ Grade Submission Due Soon — ${s}`,
  confirmation:      (s) => `✅ Grade Submission Received — ${s}`,
  declined:          (s) => `❌ Grade Submission Declined — ${s}`,
  at_risk_summary:   (s) => `⚠️ At-Risk Members — ${s}`,
}

function buildBody(opts: SendEmailOptions): string {
  const { memberName, semesterName, deadline, submitUrl, type } = opts
  const btn = submitUrl
    ? `<p style="margin:24px 0"><a href="${submitUrl}" style="background:#f59e0b;color:#1e293b;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">Submit Your Grades</a></p>`
    : ''

  const bodies: Record<EmailType, string> = {
    reminder: `
      <p>Hi ${memberName},</p>
      <p>Grade submissions are now open for <strong>${semesterName}</strong>.</p>
      <p><strong>Deadline:</strong> ${deadline}</p>
      ${btn}
      <p>Log into Blackboard, screenshot your grades page, and upload it through the portal. You can also select "No Grade" if you are not enrolled this semester.</p>
    `,
    deadline_warning: `
      <p>Hi ${memberName},</p>
      <p>This is a reminder that grade submissions for <strong>${semesterName}</strong> are due soon.</p>
      <p><strong>Deadline:</strong> ${deadline}</p>
      ${btn}
      <p>Please submit as soon as possible to avoid being marked as non-compliant.</p>
    `,
    confirmation: `
      <p>Hi ${memberName},</p>
      <p>Your grade submission for <strong>${semesterName}</strong> has been received successfully.</p>
      <p>The VP of Academics will review your submission and no further action is needed from you.</p>
    `,
    declined: `
      <p>Hi ${memberName},</p>
      <p>Your grade submission for <strong>${semesterName}</strong> has been <strong style="color:#dc2626;">declined</strong> by the VP of Academics.</p>
      ${opts.declineReason ? `<p><strong>Reason:</strong> ${opts.declineReason}</p>` : ''}
      <p>Please log back into the portal and resubmit a correct screenshot of your grades.</p>
      ${btn}
      <p>If you have questions, contact your VP of Academics directly.</p>
    `,
    at_risk_summary: `
      <p>Hi ${memberName},</p>
      <p>The following members are currently below the GPA threshold${opts.threshold != null ? ` of <strong>${opts.threshold.toFixed(2)}</strong>` : ''} for <strong>${semesterName}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:13px;">Member</th>
            <th style="text-align:left;padding:8px 12px;color:#94a3b8;font-size:13px;">GPA</th>
          </tr>
        </thead>
        <tbody>
          ${(opts.atRiskMembers ?? []).map(m => `
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:8px 12px;color:#f1f5f9;font-size:13px;">${m.name}</td>
            <td style="padding:8px 12px;color:${m.gpa < 2.0 ? '#f87171' : '#fbbf24'};font-weight:bold;font-size:13px;">${m.gpa.toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p>Please follow up with these members as appropriate.</p>
    `,
  }

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;">
      <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#f59e0b;margin:0;font-size:20px;">Chapter Grade Portal</h1>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
        ${bodies[type]}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:12px;margin:0">This is an automated message from your chapter's academic portal. Do not reply to this email.</p>
      </div>
    </body>
    </html>
  `
}

export async function sendEmail(opts: SendEmailOptions) {
  await transporter.sendMail({
    from: `"Chapter Academics" <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: SUBJECTS[opts.type](opts.semesterName),
    html: buildBody(opts),
  })
}
