import nodemailer from 'nodemailer';

// Create SMTP transporter for Brevo
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP configuration missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail(to: string, subject: string, html: string, toName?: string) {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: {
        name: process.env.FROM_NAME || 'Nourish',
        address: process.env.FROM_EMAIL || 'noreply@yourdomain.com'
      },
      to: toName ? `${toName} <${to}>` : to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, data: info };
  } catch (error: any) {
    console.error('SMTP email send error:', error);
    return { success: false, error: error.message };
  }
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  verifyUrl: string
) {
  return await sendEmail(
    email,
    'Verify your email - Nourish',
    getVerificationEmailTemplate(name, verifyUrl),
    name
  );
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
) {
  return await sendEmail(
    email,
    'Reset your password - Nourish',
    getPasswordResetEmailTemplate(name, resetUrl),
    name
  );
}

function getVerificationEmailTemplate(name: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Verify your email - Nourish</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <div style="background: rgba(255,255,255,0.2); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <div style="font-size: 36px;">🌱</div>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Welcome to Nourish!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 18px; font-weight: 400;">Your wellness journey starts here</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hi ${name}! 👋</h2>
              
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                Thank you for joining Nourish! We're excited to help you on your wellness journey. To get started, please verify your email address by clicking the button below.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${verifyUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;">
                      ✨ Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #667eea;">
                <p style="color: #4a5568; font-size: 14px; margin: 0 0 10px; font-weight: 600;">Having trouble with the button?</p>
                <p style="color: #718096; font-size: 14px; margin: 0; word-break: break-all;">
                  Copy and paste this link: <a href="${verifyUrl}" style="color: #667eea; text-decoration: none;">${verifyUrl}</a>
                </p>
              </div>
              
              <!-- Security Notice -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                <p style="color: #718096; font-size: 14px; margin: 0; line-height: 1.5;">
                  🔒 <strong>Security notice:</strong> This verification link will expire in 24 hours for your security. If you didn't create a Nourish account, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 30px; text-align: center; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0;">
              <p style="color: #718096; font-size: 14px; margin: 0 0 10px;">
                Need help? Contact us at <a href="mailto:support@nourish.com" style="color: #667eea; text-decoration: none;">support@nourish.com</a>
              </p>
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Nourish. Made with ❤️ for your wellness journey.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getPasswordResetEmailTemplate(name: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Reset your password - Nourish</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <div style="background: rgba(255,255,255,0.2); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <div style="font-size: 36px;">🔐</div>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Password Reset</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 18px; font-weight: 400;">Secure your account</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1a1a1a; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hi ${name}! 👋</h2>
              
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                We received a request to reset your password for your Nourish account. If this was you, click the button below to create a new password.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${resetUrl}" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4); transition: all 0.3s ease;">
                      🔑 Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #ef4444;">
                <p style="color: #4a5568; font-size: 14px; margin: 0 0 10px; font-weight: 600;">Having trouble with the button?</p>
                <p style="color: #718096; font-size: 14px; margin: 0; word-break: break-all;">
                  Copy and paste this link: <a href="${resetUrl}" style="color: #ef4444; text-decoration: none;">${resetUrl}</a>
                </p>
              </div>
              
              <!-- Security Notice -->
              <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #0ea5e9;">
                <p style="color: #0c4a6e; font-size: 14px; margin: 0 0 10px; font-weight: 600;">🛡️ Security Information</p>
                <ul style="color: #075985; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.5;">
                  <li>This reset link expires in 24 hours</li>
                  <li>If you didn't request this, you can safely ignore this email</li>
                  <li>Your current password remains unchanged until you create a new one</li>
                </ul>
              </div>
              
              <!-- Help Section -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                <p style="color: #718096; font-size: 14px; margin: 0; line-height: 1.5;">
                  <strong>Didn't request this?</strong> If you didn't ask to reset your password, someone else might have entered your email address by mistake. You can safely ignore this email - your account remains secure.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 30px; text-align: center; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0;">
              <p style="color: #718096; font-size: 14px; margin: 0 0 10px;">
                Need help? Contact us at <a href="mailto:support@nourish.com" style="color: #ef4444; text-decoration: none;">support@nourish.com</a>
              </p>
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Nourish. Made with ❤️ for your wellness journey.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
