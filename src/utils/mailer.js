const transporter = require('../config/nodemailer');

async function sendVerificationEmail(emailId, token){

    const info = await transporter.sendMail({
    from: {
        name: "CodeQuest Team",
        address:`noreply@codequest.com`,
    },
    to:{
        address:emailId,
    }, 
    subject: "Email Verification", 
    text: `Verify your CodeQuest account by visiting this link (expires in 10 minutes):https://codequest.akashprojects.dev/verify?token=${token}`, 
    html: `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;"><h1 style="font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px;">Verify your CodeQuest account</h1><p style="font-size: 15px; color: #6b7280; margin-bottom: 24px;">Thanks for signing up! Click the button below to verify your email address. This link expires in <strong>10 minutes</strong>.</p><a href="${process.env.CLIENT_URL}/verify?token=${token}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; font-weight: 600;">Verify Email</a><p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">If you didn't create a CodeQuest account, you can safely ignore this email.</p></div>`, 
  });
}

module.exports = sendVerificationEmail