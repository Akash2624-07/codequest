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
    html: `<h2>Verify your CodeQuest account</h2><p>Click the link below to verify your email. This link expires in 10 minutes.</p><a href="http://localhost:7000/user/verify?token=${token}">Verify Email</a><p>If you didn't create an account, ignore this email.</p>`, 
  });
}

module.exports = sendVerificationEmail