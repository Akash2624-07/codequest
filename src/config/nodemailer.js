const nodemailer = require("nodemailer");

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  service:"Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports = transporter