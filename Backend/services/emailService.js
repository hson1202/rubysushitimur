import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import foodModel from '../models/foodModel.js'
import restaurantLocationModel from '../models/restaurantLocationModel.js'
import RestaurantInfo from '../models/restaurantInfoModel.js'
import { formatOrderStreetLine } from '../utils/addressFormat.js'

/**
 * Fetches current restaurant branding from DB.
 * Returns a safe object with fallback-empty strings so templates never show undefined.
 */
const getRestaurantBranding = async () => {
  try {
    const info = await RestaurantInfo.getSingleton()
    return {
      name: info.restaurantName || 'Restaurant',
      address: info.address || '',
      email: info.email || '',
      phone: info.phone || '',
      copyrightText: info.copyrightText || `© ${new Date().getFullYear()} Restaurant. All rights reserved.`
    }
  } catch {
    return {
      name: 'Restaurant',
      address: '',
      email: '',
      phone: '',
      copyrightText: `© ${new Date().getFullYear()} Restaurant. All rights reserved.`
    }
  }
}

const getSupportEmail = () => process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || ''

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

const normalizeEmailList = (emails) => {
  if (!emails) return []
  const list = Array.isArray(emails) ? emails : String(emails).split(/[,;]+/)
  return [...new Set(
    list
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e))
  )]
}

/**
 * Recipients for admin alerts (new order / contact / reservation).
 * Uses Restaurant Info notificationEmails from admin UI, plus ADMIN_EMAIL / EMAIL_USER fallback.
 */
const getAdminNotificationEmails = async () => {
  let fromDb = []
  try {
    const info = await RestaurantInfo.getSingleton()
    fromDb = normalizeEmailList(info.notificationEmails)
  } catch {
    // ignore — fall back to env
  }
  const fromEnv = normalizeEmailList(process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '')
  return [...new Set([...fromDb, ...fromEnv])]
}

const getSupportLine = (lang = 'en') => {
  const email = getSupportEmail()
  if (!email) return { html: '', text: '' }

  const langCode = lang?.split('-')[0] || 'en'
  const templates = {
    vi: 'Nếu cần hỗ trợ, vui lòng gửi email về: {email}',
    en: 'If you need support, please email: {email}',
    hu: 'Ha segítségre van szüksége, kérjük írjon ide: {email}'
  }
  const template = templates[langCode] || templates.en
  const text = template.replace('{email}', email)
  const html = `<p>${template.replace('{email}', `<a href="mailto:${email}">${email}</a>`)}</p>`
  return { html, text }
}

// Create transporter (supports Gmail, Resend, and custom SMTP)
export const createTransporter = () => {
  const resendKey = process.env.RESEND_API_KEY
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS
  const host = process.env.EMAIL_HOST
  const port = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined
  const service = process.env.EMAIL_SERVICE || 'gmail'
  const secure = process.env.EMAIL_SECURE === 'true' || (port === 465)

  // Priority 1: Resend (recommended for production)
  if (resendKey) {
    try {
      const resend = new Resend(resendKey)
      console.log('✅ Email configured via Resend')
      console.log(`   API Key: ${resendKey.substring(0, 10)}...`)
      console.log(`   From: ${user || 'noreply@yourdomain.com'}`)
      
      // Return Resend instance with nodemailer-like interface
      return {
        isResend: true,
        resend,
        sendMail: async (mailOptions) => {
          try {
            const result = await resend.emails.send({
              from: mailOptions.from || user || 'noreply@yourdomain.com',
              to: mailOptions.to,
              subject: mailOptions.subject,
              html: mailOptions.html,
              text: mailOptions.text
            })
            
            // Check for errors in Resend response
            if (result.error) {
              const errorMessage = result.error.message || 'Unknown Resend API error'
              console.error('❌ Resend API error:', errorMessage)
              throw new Error(`Resend API error: ${errorMessage}`)
            }
            
            // Check if we got a valid message ID
            const messageId = result.data?.id || result.id
            if (!messageId) {
              console.error('❌ Resend API returned no message ID:', result)
              throw new Error('Resend API returned no message ID')
            }
            
            return { messageId }
          } catch (error) {
            // Re-throw the error so it can be caught by the calling function
            console.error('❌ Error in Resend sendMail:', error.message)
            throw error
          }
        }
      }
    } catch (error) {
      console.error('❌ Error creating Resend client:', error.message)
      return null
    }
  }

  // Priority 2: Gmail/SMTP (for development or if Resend not available)
  if (!user || !pass) {
    console.log('⚠️ Email configuration not found. Emails will not be sent.')
    console.log('⚠️ Required: RESEND_API_KEY (recommended) or EMAIL_USER + EMAIL_PASSWORD')
    console.log('📋 Current config:')
    console.log('   - RESEND_API_KEY:', resendKey ? '✓ Set' : '✗ Missing')
    console.log('   - EMAIL_USER:', user ? '✓ Set' : '✗ Missing')
    console.log('   - EMAIL_PASSWORD:', pass ? '✓ Set' : '✗ Missing')
    console.log('   - ADMIN_EMAIL:', process.env.ADMIN_EMAIL ? '✓ Set' : '✗ Missing')
    return null
  }

  try {
    let transporter
    if (host) {
      transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure,
        auth: { user, pass }
      })
      console.log('✅ Email transporter configured via SMTP')
      console.log(`   Host: ${host}:${port || 587}`)
    } else {
      transporter = nodemailer.createTransport({
        service,
        auth: { user, pass }
      })
      console.log(`✅ Email transporter configured via ${service}`)
      console.log(`   From: ${user}`)
    }
    return transporter
  } catch (error) {
    console.error('❌ Error creating email transporter:', error.message)
    console.error('   Full error:', error)
    return null
  }
}

// Test email service connection
export const testEmailService = async () => {
  try {
    const transporter = createTransporter()
    
    if (!transporter) {
      return {
        success: false,
        configured: false,
        message: 'Email service not configured. Please set RESEND_API_KEY or EMAIL_USER + EMAIL_PASSWORD in environment variables.'
      }
    }

    // Resend doesn't need verify (API key is verified on first send)
    if (transporter.isResend) {
      console.log('✅ Resend email service ready!')
      return {
        success: true,
        configured: true,
        provider: 'Resend',
        message: 'Resend email service is configured correctly',
        from: process.env.EMAIL_USER || 'noreply@yourdomain.com',
        adminEmail: process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'admin@yourdomain.com'
      }
    }

    // Verify SMTP connection (for Gmail/custom SMTP)
    await transporter.verify()
    
    console.log('✅ Email service connection verified successfully!')
    return {
      success: true,
      configured: true,
      provider: process.env.EMAIL_SERVICE || 'SMTP',
      message: 'Email service is working correctly',
      from: process.env.EMAIL_USER,
      adminEmail: process.env.ADMIN_EMAIL || process.env.EMAIL_USER
    }
  } catch (error) {
    console.error('❌ Email service verification failed:', error.message)
    console.error('   Error details:', error)
    return {
      success: false,
      configured: true,
      message: `Email service configured but verification failed: ${error.message}`,
      error: error.message,
      errorCode: error.code
    }
  }
}

// Send test email
export const sendTestEmail = async (toEmail) => {
  try {
    const transporter = createTransporter()
    
    if (!transporter) {
      return {
        success: false,
        message: 'Email service not configured'
      }
    }

    const branding = await getRestaurantBranding()
    const brandName = branding.name

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `✅ ${brandName} - Email Service Test`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Email Test</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #27ae60; color: white; padding: 20px; text-align: center; border-radius: 8px;">
            <h1>✅ Email Service Working!</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px;">
            <h2>🎉 Success!</h2>
            <p>This is a test email from <strong>${brandName} Backend</strong>.</p>
            <p>If you're receiving this email, it means the email service is configured correctly and working.</p>
            
            <div style="background: white; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #27ae60;">
              <h3>Email Configuration:</h3>
              <p><strong>From:</strong> ${process.env.EMAIL_USER}</p>
              <p><strong>To:</strong> ${toEmail}</p>
              <p><strong>Service:</strong> ${process.env.EMAIL_SERVICE || 'gmail'}</p>
              <p><strong>Admin Email:</strong> ${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}</p>
            </div>
            
            <p><strong>What this means:</strong></p>
            <ul>
              <li>✅ Email credentials are valid</li>
              <li>✅ SMTP connection is working</li>
              <li>✅ Order confirmation emails will be sent</li>
              <li>✅ Admin notification emails will be sent</li>
            </ul>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              <em>This is an automated test email from ${brandName} Backend.<br>
              Timestamp: ${new Date().toLocaleString()}</em>
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
✅ ${brandName} - Email Service Test

Success! This is a test email from ${brandName} Backend.

If you're receiving this email, it means the email service is configured correctly and working.

Email Configuration:
- From: ${process.env.EMAIL_USER}
- To: ${toEmail}
- Service: ${process.env.EMAIL_SERVICE || 'gmail'}
- Admin Email: ${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}

What this means:
✅ Email credentials are valid
✅ SMTP connection is working
✅ Order confirmation emails will be sent
✅ Admin notification emails will be sent

---
This is an automated test email from ${brandName} Backend.
Timestamp: ${new Date().toLocaleString()}
      `
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Test email sent successfully:', result.messageId)
    
    return {
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId,
      to: toEmail
    }
  } catch (error) {
    console.error('❌ Error sending test email:', error)
    return {
      success: false,
      message: `Failed to send test email: ${error.message}`,
      error: error.message,
      errorCode: error.code
    }
  }
}

// Send reservation confirmation email
export const sendReservationConfirmation = async (reservation) => {
  try {
    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured');
      return { 
        success: true, 
        messageId: 'email_not_configured',
        message: 'Reservation saved but email not sent (email service not configured)'
      }
    }

    const branding = await getRestaurantBranding()
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: reservation.email,
      subject: `Reservation Confirmation - ${branding.name}`,
      html: generateConfirmationEmailHTML(reservation, branding),
      text: generateConfirmationEmailText(reservation, branding)
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Confirmation email sent successfully:', result.messageId)
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending confirmation email:', error)
    return { success: false, error: error.message }
  }
}

// Send admin notification for new reservation
export const sendAdminReservationNotification = async (reservation) => {
  try {
    const adminEmails = await getAdminNotificationEmails()

    if (!adminEmails.length) {
      console.error('❌ Admin reservation notification not sent: no notification emails configured')
      return {
        success: false,
        message: 'Admin reservation notification not sent (no notification emails configured)'
      }
    }

    const transporter = createTransporter()

    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured')
      return {
        success: true,
        messageId: 'email_not_configured',
        message: 'Admin reservation notification not sent (email service not configured)'
      }
    }

    const branding = await getRestaurantBranding()

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmails.join(', '),
      subject: `📅 New Reservation - ${reservation.customerName} - ${branding.name}`,
      html: generateAdminReservationNotificationHTML(reservation, branding),
      text: generateAdminReservationNotificationText(reservation, branding)
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Admin reservation notification email sent successfully:', result.messageId)
    console.log(`   To: ${adminEmails.join(', ')}`)
    console.log(`   From: ${reservation.customerName} (${reservation.email})`)
    return { success: true, messageId: result.messageId }

  } catch (error) {
    console.error('❌ Error sending admin reservation notification email:', error)
    return { success: false, error: error.message }
  }
}

// Send reservation status update email
export const sendStatusUpdateEmail = async (reservation, oldStatus, newStatus) => {
  try {
    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured');
      return { 
        success: true, 
        messageId: 'email_not_configured',
        message: 'Status updated but email not sent (email service not configured)'
      }
    }
    
    const branding = await getRestaurantBranding()

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: reservation.email,
      subject: `Reservation Status Updated - ${branding.name}`,
      html: generateStatusUpdateEmailHTML(reservation, oldStatus, newStatus, branding),
      text: generateStatusUpdateEmailText(reservation, oldStatus, newStatus, branding)
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Status update email sent successfully:', result.messageId)
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending status update email:', error)
    return { success: false, error: error.message }
  }
}

// Send contact message confirmation email
export const sendContactConfirmation = async (contactMessage, adminResponse = null) => {
  try {
    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured');
      return { 
        success: true, 
        messageId: 'email_not_configured',
        message: 'Contact message saved but email not sent (email service not configured)'
      }
    }
    
    const branding = await getRestaurantBranding()

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: contactMessage.email,
      subject: adminResponse ? `Response to Your Message - ${branding.name}` : `Message Received - ${branding.name}`,
      html: generateContactConfirmationEmailHTML(contactMessage, adminResponse, branding),
      text: generateContactConfirmationEmailText(contactMessage, adminResponse, branding)
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Contact confirmation email sent successfully:', result.messageId)
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending contact confirmation email:', error)
    return { success: false, error: error.message }
  }
}

// Send admin notification for new contact message
export const sendAdminNotification = async (contactMessage) => {
  try {
    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured');
      return { 
        success: true, 
        messageId: 'email_not_configured',
        message: 'Admin notification not sent (email service not configured)'
      }
    }
    
    const branding = await getRestaurantBranding()
    const adminEmails = await getAdminNotificationEmails()

    if (!adminEmails.length) {
      console.error('❌ Admin notification not sent: no notification emails configured')
      return {
        success: false,
        message: 'Admin notification not sent (no notification emails configured)'
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmails.join(', '),
      subject: `📬 Message #${contactMessage.messageNumber || contactMessage._id.toString().slice(-6)} - ${contactMessage.subject.toUpperCase()} - ${branding.name}`,
      html: generateAdminNotificationEmailHTML(contactMessage, branding),
      text: generateAdminNotificationEmailText(contactMessage, branding)
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Admin notification email sent successfully:', result.messageId)
    console.log(`   To: ${adminEmails.join(', ')}`)
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending admin notification email:', error)
    return { success: false, error: error.message }
  }
}

// Send order confirmation email
export const sendOrderConfirmation = async (order) => {
  try {
    // Kiểm tra xem có email không
    if (!order.customerInfo?.email) {
      console.log('⚠️ Order confirmation email not sent: No email address provided');
      return { 
        success: true, 
        messageId: 'no_email',
        message: 'Order confirmation not sent (no email address provided)'
      }
    }

    // Fetch global box fee from restaurant settings
    let globalBoxFee = 0.3; // Default
    try {
      const restaurant = await restaurantLocationModel.findOne({ isActive: true, isPrimary: true });
      if (restaurant && restaurant.boxFee !== undefined) {
        globalBoxFee = restaurant.boxFee;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch box fee, using default 0.3:', err.message);
    }
    
    // Store box fee in order for email calculation
    order._globalBoxFee = globalBoxFee;

    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.log('⚠️ Email not sent: Email service not configured');
      return { 
        success: true, 
        messageId: 'email_not_configured',
        message: 'Order confirmation not sent (email service not configured)'
      }
    }
    
    const branding = await getRestaurantBranding()
    const lang = order.language || 'vi';
    const t = getEmailTranslations(lang);
    const subjectMap = {
      vi: `Cảm ơn bạn đã đặt hàng #${order.trackingCode} - ${branding.name}`,
      en: `Thanks for your order #${order.trackingCode} - ${branding.name}`,
      hu: `Köszönjük a rendelését #${order.trackingCode} - ${branding.name}`
    };
    const langCode = lang?.split('-')[0] || 'vi';
    const subject = subjectMap[langCode] || subjectMap['vi'];
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: order.customerInfo.email,
      subject: subject,
      html: generateOrderConfirmationEmailHTML(order, branding),
      text: generateOrderConfirmationEmailText(order, branding)
    }
    
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Order confirmation email sent successfully:', result.messageId)
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending order confirmation email:', error)
    return { success: false, error: error.message }
  }
}

// Send admin notification for new order
export const sendAdminOrderNotification = async (order) => {
  try {
    const adminEmails = await getAdminNotificationEmails()
    
    if (!adminEmails.length) {
      console.error('❌ Admin order notification not sent: no notification emails configured');
      console.error('   Add emails in Admin → Restaurant Info, or set ADMIN_EMAIL in .env');
      return { 
        success: false, 
        messageId: 'no_admin_email',
        message: 'Admin order notification not sent (no notification emails configured)'
      }
    }
    
    console.log(`📧 Preparing to send admin order notification to: ${adminEmails.join(', ')}`);
    console.log(`   Order ID: ${order._id}, Tracking Code: ${order.trackingCode}`);
    
    const transporter = createTransporter()
    
    // If no transporter available, return success but log warning
    if (!transporter) {
      console.error('❌ Admin order notification not sent: Email service not configured');
      console.error('   Please set RESEND_API_KEY or EMAIL_USER + EMAIL_PASSWORD in .env file');
      return { 
        success: false, 
        messageId: 'email_not_configured',
        message: 'Admin order notification not sent (email service not configured)'
      }
    }
    
    const branding = await getRestaurantBranding()

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmails.join(', '),
      subject: `Đơn hàng mới #${order.trackingCode} - ${order.customerInfo.name}`,
      html: await generateAdminOrderNotificationEmailHTML(order, branding),
      text: await generateAdminOrderNotificationEmailText(order, branding)
    }
    
    console.log(`📤 Sending admin order notification email to: ${adminEmails.join(', ')}`);
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Admin order notification email sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   To: ${adminEmails.join(', ')}`);
    console.log(`   Order: #${order.trackingCode}`);
    return { success: true, messageId: result.messageId }
    
  } catch (error) {
    console.error('❌ Error sending admin order notification email:', error)
    console.error('   Error details:', error.message)
    if (error.response) {
      console.error('   Error response:', error.response)
    }
    return { success: false, error: error.message }
  }
}

// Generate admin reservation notification HTML
const generateAdminReservationNotificationHTML = (reservation, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const phone = branding.phone || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Reservation Alert</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #c0392b, #e74c3c); color: white; padding: 25px 30px; text-align: center; }
        .header h1 { margin: 0 0 5px; font-size: 22px; }
        .header p { margin: 0; opacity: 0.9; font-size: 14px; }
        .alert-badge { display: inline-block; background: #fff; color: #e74c3c; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-top: 10px; }
        .body { padding: 30px; }
        .section-title { font-size: 13px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px; }
        .info-card { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 8px; padding: 18px 20px; margin-bottom: 15px; }
        .info-row { display: flex; padding: 7px 0; border-bottom: 1px solid #f0f0f0; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: bold; color: #555; min-width: 140px; font-size: 14px; }
        .info-value { color: #222; font-size: 14px; }
        .highlight { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 14px 18px; margin: 15px 0; }
        .highlight p { margin: 0; color: #856404; font-size: 14px; }
        .note-box { background: #f8f9fa; border-left: 4px solid #e74c3c; border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 15px 0; }
        .note-box p { margin: 0; color: #555; font-size: 14px; }
        .footer { background: #f8f8f8; text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍽️ ${name}</h1>
          <p>Restaurant Management System</p>
          <div class="alert-badge">📅 NEW RESERVATION</div>
        </div>

        <div class="body">
          <p style="font-size:16px; margin-top:0;">A new reservation has been submitted and is <strong>waiting for your confirmation</strong>.</p>

          <div class="section-title">👤 Customer Information</div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">Full Name:</span>
              <span class="info-value">${reservation.customerName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Phone:</span>
              <span class="info-value">${reservation.phone}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${reservation.email}</span>
            </div>
          </div>

          <div class="section-title">📋 Reservation Details</div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${formatDate(reservation.reservationDate)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Time:</span>
              <span class="info-value">${reservation.reservationTime}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Number of Guests:</span>
              <span class="info-value">${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}</span>
            </div>
            ${reservation.note ? `
            <div class="info-row">
              <span class="info-label">Special Requests:</span>
              <span class="info-value">${reservation.note}</span>
            </div>` : ''}
          </div>

          <div class="highlight">
            <p>⚡ <strong>Action Required:</strong> Please confirm or update this reservation in the Admin Panel within 2 hours. The customer is waiting for confirmation.</p>
          </div>

          ${address || phone ? `
          <div class="section-title">📍 Restaurant Info</div>
          <div class="note-box">
            <p>${address ? `📍 ${address}<br>` : ''}${phone ? `📞 ${phone}` : ''}</p>
          </div>` : ''}
        </div>

        <div class="footer">
          <p>This is an automated alert from the ${name} reservation system.</p>
          <p>${copyrightText}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate admin reservation notification plain text
const generateAdminReservationNotificationText = (reservation, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return `
[${name}] NEW RESERVATION ALERT

A new reservation has been submitted and is waiting for your confirmation.

CUSTOMER INFORMATION:
  Name  : ${reservation.customerName}
  Phone : ${reservation.phone}
  Email : ${reservation.email}

RESERVATION DETAILS:
  Date   : ${formatDate(reservation.reservationDate)}
  Time   : ${reservation.reservationTime}
  Guests : ${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}
${reservation.note ? `  Notes  : ${reservation.note}` : ''}

ACTION REQUIRED:
Please confirm or update this reservation in the Admin Panel within 2 hours.

---
${copyrightText}
  `
}

// Generate HTML email content for confirmation
const generateConfirmationEmailHTML = (reservation, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const email = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const formatTime = (time) => {
    return time
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reservation Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .reservation-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #e74c3c; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .contact-info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${name}</h1>
          <h2>Reservation Confirmation</h2>
        </div>
        
        <div class="content">
          <p>Dear <strong>${reservation.customerName}</strong>,</p>
          
          <p>Thank you for choosing ${name}! Your reservation has been received and is currently being reviewed.</p>
          
          <div class="reservation-details">
            <h3>📅 Reservation Details</h3>
            <div class="detail-row">
              <span class="label">Date:</span>
              <span class="value">${formatDate(reservation.reservationDate)}</span>
            </div>
            <div class="detail-row">
              <span class="label">Time:</span>
              <span class="value">${formatTime(reservation.reservationTime)}</span>
            </div>
            <div class="detail-row">
              <span class="label">Number of Guests:</span>
              <span class="value">${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}</span>
            </div>
            ${reservation.note ? `
            <div class="detail-row">
              <span class="label">Special Requests:</span>
              <span class="value">${reservation.note}</span>
            </div>
            ` : ''}
          </div>
          
          <div class="contact-info">
            <h4>📍 Restaurant Information</h4>
            ${address ? `<p><strong>Address:</strong> ${address}</p>` : ''}
            ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
          </div>
          
          <p><strong>Important Notes:</strong></p>
          <ul>
            <li>Please arrive 5-10 minutes before your reservation time</li>
            <li>We will confirm your booking within 2 hours</li>
            <li>For any changes, please contact us at least 24 hours in advance</li>
            <li>Dress code: Smart casual</li>
          </ul>
          
          <p>We look forward to serving you!</p>
          
          <p>Best regards,<br>
          <strong>The ${name} Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email. Please do not reply directly to this message.</p>
          ${getSupportLine('en').html}
          <p>${copyrightText}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for confirmation
const generateConfirmationEmailText = (reservation, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const email = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  return `
${name} - Reservation Confirmation

Dear ${reservation.customerName},

Thank you for choosing ${name}! Your reservation has been received and is currently being reviewed.

RESERVATION DETAILS:
Date: ${formatDate(reservation.reservationDate)}
Time: ${reservation.reservationTime}
Number of Guests: ${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}
${reservation.note ? `Special Requests: ${reservation.note}` : ''}

RESTAURANT INFORMATION:
${address ? `Address: ${address}` : ''}
${email ? `Email: ${email}` : ''}

IMPORTANT NOTES:
- Please arrive 5-10 minutes before your reservation time
- We will confirm your booking within 2 hours
- For any changes, please contact us at least 24 hours in advance
- Dress code: Smart casual

We look forward to serving you!

Best regards,
The ${name} Team

---
This is an automated email. Please do not reply directly to this message.
${getSupportLine('en').text}
${copyrightText}
  `
}

// Generate HTML email content for status updates
const generateStatusUpdateEmailHTML = (reservation, oldStatus, newStatus, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const email = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const getStatusText = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed'
      case 'cancelled': return 'Cancelled'
      case 'completed': return 'Completed'
      default: return 'Pending'
    }
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reservation Status Update</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .reservation-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #e74c3c; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${name}</h1>
          <h2>Reservation Status Update</h2>
        </div>
        
        <div class="content">
          <p>Dear <strong>${reservation.customerName}</strong>,</p>
          
          <p>Your reservation has been updated.</p>
          
          <div class="reservation-details">
            <h3>📅 Reservation Details</h3>
            <div class="detail-row">
              <span class="label">Date:</span>
              <span class="value">${formatDate(reservation.reservationDate)}</span>
            </div>
            <div class="detail-row">
              <span class="label">Time:</span>
              <span class="value">${reservation.reservationTime}</span>
            </div>
            <div class="detail-row">
              <span class="label">Number of Guests:</span>
              <span class="value">${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}</span>
            </div>
            ${reservation.adminNote ? `
            <div class="detail-row">
              <span class="label">Admin Note:</span>
              <span class="value">${reservation.adminNote}</span>
            </div>
            ` : ''}
          </div>
          
          ${newStatus === 'confirmed' ? `
          <p><strong>Your reservation is confirmed! 🎉</strong></p>
          <p>Please arrive 5-10 minutes before your reservation time. We look forward to serving you!</p>
          ` : newStatus === 'cancelled' ? `
          <p><strong>Your reservation has been cancelled.</strong></p>
          <p>If you have any questions, please contact us directly.</p>
          ` : newStatus === 'completed' ? `
          <p><strong>Thank you for dining with us!</strong></p>
          <p>We hope you enjoyed your meal. Please visit us again soon!</p>
          ` : ''}
          
          <p>If you have any questions, please contact us:</p>
          <p>${email ? `<strong>Email:</strong> ${email}<br>` : ''}
          ${address ? `<strong>Address:</strong> ${address}` : ''}</p>
          
          <p>Best regards,<br>
          <strong>The ${name} Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email. Please do not reply directly to this message.</p>
          ${getSupportLine('en').html}
          <p>${copyrightText}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for status updates
const generateStatusUpdateEmailText = (reservation, oldStatus, newStatus, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const email = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  
  const getStatusText = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed'
      case 'cancelled': return 'Cancelled'
      case 'completed': return 'Completed'
      default: return 'Pending'
    }
  }
  
  return `
${name} - Reservation Status Update

Dear ${reservation.customerName},

Your reservation has been updated.

RESERVATION DETAILS:
Date: ${formatDate(reservation.reservationDate)}
Time: ${reservation.reservationTime}
Number of Guests: ${reservation.numberOfPeople} ${reservation.numberOfPeople === 1 ? 'person' : 'people'}
${reservation.adminNote ? `Admin Note: ${reservation.adminNote}` : ''}

${newStatus === 'confirmed' ? `
Your reservation is confirmed! 🎉

Please arrive 5-10 minutes before your reservation time. We look forward to serving you!
` : newStatus === 'cancelled' ? `
Your reservation has been cancelled.

If you have any questions, please contact us directly.
` : newStatus === 'completed' ? `
Thank you for dining with us!

We hope you enjoyed your meal. Please visit us again soon!
` : ''}

If you have any questions, please contact us:
${email ? `Email: ${email}` : ''}
${address ? `Address: ${address}` : ''}

Best regards,
The ${name} Team

---
This is an automated email. Please do not reply directly to this message.
${getSupportLine('en').text}
${copyrightText}
  `
}

// Generate HTML email content for contact confirmation
const generateContactConfirmationEmailHTML = (contactMessage, adminResponse = null, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const getSubjectText = (subject) => {
    switch (subject) {
      case 'general': return 'General Inquiry'
      case 'reservation': return 'Reservation'
      case 'feedback': return 'Feedback'
      case 'complaint': return 'Complaint'
      case 'partnership': return 'Partnership'
      case 'other': return 'Other'
      default: return subject
    }
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${adminResponse ? 'Response to Your Message' : 'Message Received'}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .message-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #e74c3c; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .contact-info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .admin-response { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${name}</h1>
          <p>${adminResponse ? 'Response to Your Message' : 'Message Received'}</p>
        </div>
        
        <div class="content">
          <p>Dear <strong>${contactMessage.name}</strong>,</p>
          
          ${adminResponse ? `
          <p>Thank you for contacting us. We have received your message and would like to provide you with a response:</p>
          
          <div class="admin-response">
            <h3>Our Response:</h3>
            <p>${adminResponse}</p>
          </div>
          
          <p>If you have any further questions or need additional assistance, please don't hesitate to contact us again.</p>
          ` : `
          <p>Thank you for contacting ${name}. We have received your message and will get back to you as soon as possible.</p>
          
          <p>Here are the details of your message:</p>
          `}
          
          <div class="message-details">
            <div class="detail-row">
              <span class="label">Subject:</span>
              <span class="value">${getSubjectText(contactMessage.subject)}</span>
            </div>
            <div class="detail-row">
              <span class="label">Message:</span>
              <span class="value">${contactMessage.message}</span>
            </div>
            <div class="detail-row">
              <span class="label">Sent:</span>
              <span class="value">${formatDate(contactMessage.createdAt)}</span>
            </div>
          </div>
          
          <div class="contact-info">
            <h3>Contact Information</h3>
            <p>${branding.email ? `<strong>Email:</strong> ${branding.email}<br>` : ''}
            ${branding.address ? `<strong>Address:</strong> ${branding.address}` : ''}</p>
          </div>
          
          <p>Best regards,<br>
          <strong>The ${name} Team</strong></p>
        </div>
        
        <div class="footer">
          <p>This is an automated email. Please do not reply directly to this message.</p>
          ${getSupportLine('en').html}
          <p>${copyrightText}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for contact confirmation
const generateContactConfirmationEmailText = (contactMessage, adminResponse = null, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const address = branding.address || ''
  const email = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const getSubjectText = (subject) => {
    switch (subject) {
      case 'general': return 'General Inquiry'
      case 'reservation': return 'Reservation'
      case 'feedback': return 'Feedback'
      case 'complaint': return 'Complaint'
      case 'partnership': return 'Partnership'
      case 'other': return 'Other'
      default: return subject
    }
  }
  
  return `
${name} - ${adminResponse ? 'Response to Your Message' : 'Message Received'}

Dear ${contactMessage.name},

${adminResponse ? `
Thank you for contacting us. We have received your message and would like to provide you with a response:

OUR RESPONSE:
${adminResponse}

If you have any further questions or need additional assistance, please don't hesitate to contact us again.
` : `
Thank you for contacting ${name}. We have received your message and will get back to you as soon as possible.

Here are the details of your message:
`}

MESSAGE DETAILS:
Subject: ${getSubjectText(contactMessage.subject)}
Message: ${contactMessage.message}
Sent: ${formatDate(contactMessage.createdAt)}

CONTACT INFORMATION:
${email ? `Email: ${email}` : ''}
${address ? `Address: ${address}` : ''}

Best regards,
The ${name} Team

---
This is an automated email. Please do not reply directly to this message.
${getSupportLine('en').text}
${copyrightText}
  `
}

// Generate HTML email content for admin notification
const generateAdminNotificationEmailHTML = (contactMessage, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const getSubjectText = (subject) => {
    switch (subject) {
      case 'general': return 'General Inquiry'
      case 'reservation': return 'Reservation'
      case 'feedback': return 'Feedback'
      case 'complaint': return 'Complaint'
      case 'partnership': return 'Partnership'
      case 'other': return 'Other'
      default: return subject
    }
  }
  
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#e74c3c'
      case 'high': return '#f39c12'
      case 'medium': return '#3498db'
      case 'low': return '#27ae60'
      default: return '#3498db'
    }
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Message #${contactMessage.messageNumber || 'N/A'} - ${contactMessage.subject.toUpperCase()}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
        .header p { margin: 0; font-size: 16px; opacity: 0.9; }
        .message-number { background: rgba(255,255,255,0.2); display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: bold; margin-top: 10px; }
        .content { padding: 30px; }
        .alert-box { background: #fff3cd; border-left: 4px solid #f39c12; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
        .alert-box strong { color: #856404; }
        .customer-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #dee2e6; }
        .customer-info h3 { margin: 0 0 15px 0; color: #495057; font-size: 16px; border-bottom: 2px solid #e74c3c; padding-bottom: 8px; }
        .detail-row { display: flex; justify-content: space-between; margin: 12px 0; padding: 10px; background: white; border-radius: 6px; }
        .label { font-weight: bold; color: #6c757d; font-size: 14px; }
        .value { color: #212529; font-size: 14px; text-align: right; }
        .message-content { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 2px solid #e74c3c; min-height: 100px; }
        .message-content h3 { margin: 0 0 15px 0; color: #e74c3c; font-size: 18px; }
        .message-text { color: #212529; font-size: 15px; line-height: 1.8; white-space: pre-wrap; word-wrap: break-word; }
        .footer { text-align: center; padding: 20px; background: #f8f9fa; color: #6c757d; font-size: 13px; }
        .priority-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; color: white; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .action-button { display: inline-block; background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${name}</h1>
          <p>Admin Notification - New Contact Message</p>
          <div class="message-number">MESSAGE #${contactMessage.messageNumber || 'N/A'}</div>
        </div>
        
        <div class="content">
          <div class="alert-box">
            <strong>⚡ Action Required:</strong> A new contact message has been received and requires your attention.
          </div>
          
          <div class="customer-info">
            <h3>📋 Customer Information</h3>
            <div class="detail-row">
              <span class="label">Message #:</span>
              <span class="value" style="font-weight: bold; color: #e74c3c;">#${contactMessage.messageNumber || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Name:</span>
              <span class="value"><strong>${contactMessage.name}</strong></span>
            </div>
            <div class="detail-row">
              <span class="label">Email:</span>
              <span class="value"><a href="mailto:${contactMessage.email}" style="color: #0071e3; text-decoration: none;">${contactMessage.email}</a></span>
            </div>
            <div class="detail-row">
              <span class="label">Subject:</span>
              <span class="value">${getSubjectText(contactMessage.subject)}</span>
            </div>
            <div class="detail-row">
              <span class="label">Priority:</span>
              <span class="value">
                <span class="priority-badge" style="background-color: ${getPriorityColor(contactMessage.priority)};">
                  ${contactMessage.priority}
                </span>
              </span>
            </div>
            <div class="detail-row">
              <span class="label">Received:</span>
              <span class="value">${formatDate(contactMessage.createdAt)}</span>
            </div>
          </div>
          
          <div class="message-content">
            <h3>💬 Message Content</h3>
            <div class="message-text">${contactMessage.message}</div>
          </div>
          
          <p style="margin: 20px 0; color: #6c757d; font-size: 14px;">
            <strong>📌 Next Steps:</strong><br>
            1. Review the message content above<br>
            2. Respond via email: <a href="mailto:${contactMessage.email}" style="color: #0071e3;">${contactMessage.email}</a><br>
            3. Update status in the admin panel
          </p>
        </div>
        
        <div class="footer">
          <p><strong>${name} - Admin Panel</strong></p>
          <p>This is an automated notification email for Message #${contactMessage.messageNumber || 'N/A'}</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">${copyrightText}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for admin notification
const generateAdminNotificationEmailText = (contactMessage, branding = {}) => {
  const name = branding.name || 'Restaurant'
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${name}. All rights reserved.`
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const getSubjectText = (subject) => {
    switch (subject) {
      case 'general': return 'General Inquiry'
      case 'reservation': return 'Reservation'
      case 'feedback': return 'Feedback'
      case 'complaint': return 'Complaint'
      case 'partnership': return 'Partnership'
      case 'other': return 'Other'
      default: return subject
    }
  }
  
  return `
========================================
${name} - ADMIN NOTIFICATION
========================================

📬 NEW CONTACT MESSAGE #${contactMessage.messageNumber || 'N/A'}

⚡ PRIORITY: ${contactMessage.priority.toUpperCase()}

========================================

👤 CUSTOMER INFORMATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:     ${contactMessage.name}
Email:    ${contactMessage.email}
Subject:  ${getSubjectText(contactMessage.subject)}
Received: ${formatDate(contactMessage.createdAt)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 MESSAGE CONTENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contactMessage.message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

========================================
📌 ACTION REQUIRED:
1. Review the message above
2. Reply to: ${contactMessage.email}
3. Update status in admin panel
========================================

This is an automated notification for Message #${contactMessage.messageNumber || 'N/A'}
${copyrightText}
  `
}

// Email translations for customer order confirmation
const getEmailTranslations = (lang, brandName = 'Restaurant') => {
  const langCode = lang?.split('-')[0] || 'vi'; // Extract base language code (vi, en, sk)
  
  const translations = {
    vi: {
      title: 'Xác nhận đơn hàng',
      greeting: 'Chào bạn',
      thankYou: `Cảm ơn bạn đã đặt hàng tại ${brandName}! Chúng tôi đã nhận được đơn hàng và đang chuẩn bị món ăn tươi ngon cho bạn.`,
      trackingCode: 'Mã theo dõi đơn hàng',
      orderDetails: 'Thông tin đơn hàng',
      orderDate: 'Ngày đặt',
      orderType: 'Loại đơn',
      orderTypeRegistered: 'Thành viên',
      orderTypeGuest: 'Khách vãng lai',
      fulfillmentType: 'Hình thức nhận',
      fulfillmentDelivery: 'Giao hàng',
      fulfillmentPickup: 'Lấy tại quán',
      fulfillmentDineIn: 'Dùng tại quán',
      paymentMethod: 'Thanh toán',
      paymentCOD: 'Tiền mặt khi nhận hàng',
      orderItems: 'Món đã đặt',
      subtotal: 'Tạm tính',
      deliveryFee: 'Phí giao hàng',
      systemFee: 'Phí hệ thống',
      total: 'Tổng cộng',
      deliveryAddress: 'Địa chỉ nhận hàng',
      phone: 'Số điện thoại',
      contactInfo: 'Liên hệ với chúng tôi',
      emailLabel: 'Email',
      storeAddressLabel: 'Địa chỉ cửa hàng',
      storeAddress: '',
      importantNotes: 'Một vài lưu ý nhỏ',
      note1: 'Bạn có thể theo dõi đơn hàng bằng mã',
      note2: 'Thanh toán bằng tiền mặt khi nhận hàng nhé',
      note3: 'Đơn hàng sẽ được giao trong vòng 30-60 phút',
      note4: 'Nếu có thắc mắc gì, đừng ngại liên hệ với chúng tôi nhé!',
      closing: `Cảm ơn bạn đã tin tưởng ${brandName}. Chúc bạn ngon miệng! 🍜`,
      regards: 'Thân mến,',
      team: `Đội ngũ ${brandName}`,
      footer1: 'Email này được gửi tự động. Nếu cần hỗ trợ, vui lòng liên hệ trực tiếp với chúng tôi.',
      footer2: `© ${new Date().getFullYear()} ${brandName}`
    },
    en: {
      title: 'Order Confirmation',
      greeting: 'Hi there',
      thankYou: `Thank you for ordering from ${brandName}! We've received your order and our kitchen is already preparing your delicious meal.`,
      trackingCode: 'Your Order Tracking Code',
      orderDetails: 'Order Information',
      orderDate: 'Order Date',
      orderType: 'Order Type',
      orderTypeRegistered: 'Member',
      orderTypeGuest: 'Guest',
      fulfillmentType: 'Fulfillment',
      fulfillmentDelivery: 'Delivery',
      fulfillmentPickup: 'Pickup',
      fulfillmentDineIn: 'Dine in',
      paymentMethod: 'Payment',
      paymentCOD: 'Cash on Delivery',
      orderItems: 'Your Order',
      subtotal: 'Subtotal',
      deliveryFee: 'Delivery Fee',
      systemFee: 'System Fee',
      total: 'Total',
      deliveryAddress: 'Delivery Address',
      phone: 'Phone',
      contactInfo: 'Get in Touch',
      emailLabel: 'Email',
      storeAddressLabel: 'Store Address',
      storeAddress: '',
      importantNotes: 'A Few Quick Notes',
      note1: 'You can track your order using code',
      note2: 'Please have cash ready for payment upon delivery',
      note3: 'Your order will arrive within 30-60 minutes',
      note4: 'If you have any questions, feel free to reach out to us anytime!',
      closing: `Thanks for choosing ${brandName}. Enjoy your meal! 🍜`,
      regards: 'Warm regards,',
      team: `The ${brandName} Team`,
      footer1: 'This is an automated email. For support, please contact us directly.',
      footer2: `© ${new Date().getFullYear()} ${brandName}`
    },
    hu: {
      title: 'Rendelés visszaigazolása',
      greeting: 'Helló',
      thankYou: `Köszönjük, hogy a ${brandName}-nál rendelt! Megkaptuk rendelését, konyhánk már készíti finom ételeit.`,
      trackingCode: 'Követési kódja',
      orderDetails: 'Rendelés adatai',
      orderDate: 'Rendelés dátuma',
      orderType: 'Rendelés típusa',
      orderTypeRegistered: 'Tag',
      orderTypeGuest: 'Vendég',
      fulfillmentType: 'Átvétel módja',
      fulfillmentDelivery: 'Kiszállítás',
      fulfillmentPickup: 'Átvétel helyben',
      fulfillmentDineIn: 'Helyben fogyasztás',
      paymentMethod: 'Fizetés',
      paymentCOD: 'Utánvét',
      orderItems: 'Rendelése',
      subtotal: 'Részösszeg',
      deliveryFee: 'Kiszállítási díj',
      systemFee: 'Rendszerdíj',
      total: 'Összesen',
      deliveryAddress: 'Szállítási cím',
      phone: 'Telefon',
      contactInfo: 'Kapcsolat',
      emailLabel: 'E-mail',
      storeAddressLabel: 'Üzlet címe',
      storeAddress: '',
      importantNotes: 'Néhány gyors megjegyzés',
      note1: 'Rendelését a kóddal követheti nyomon',
      note2: 'Kérjük, készítse elő a készpénzt a kiszállításkor',
      note3: 'Rendelése 30–60 percen belül megérkezik',
      note4: 'Kérdése van? Keressen minket bátran!',
      closing: `Köszönjük, hogy a ${brandName}-t választotta. Jó étvágyat! 🍜`,
      regards: 'Üdvözlettel,',
      team: `A ${brandName} csapata`,
      footer1: 'Ez egy automatikus e-mail. Támogatásért kérjük, közvetlenül írjon nekünk.',
      footer2: `© ${new Date().getFullYear()} ${brandName}`
    }
  };
  
  return translations[langCode] || translations['vi']; // Default to Vietnamese
};

// Build a human-friendly "house number + street" line for orders.
// Avoid duplicating if street already contains a leading number or includes the house number.
// Calculate item price including box fee and options (same logic as frontend)
const calculateItemPrice = async (item, globalBoxFee = 0.3) => {
  // Tính giá gốc (chưa bao gồm box fee)
  let basePrice = 0;
  
  // Nếu có options và selectedOptions
  if (item.options && item.options.length > 0 && item.selectedOptions) {
    basePrice = item.price || 0;
    
    Object.entries(item.selectedOptions).forEach(([optionName, choiceCode]) => {
      const option = item.options.find(opt => opt.name === optionName);
      if (option) {
        const choice = option.choices.find(c => c.code === choiceCode);
        if (choice) {
          if (option.pricingMode === 'override') {
            basePrice = choice.price;
          } else if (option.pricingMode === 'add') {
            basePrice += choice.price;
          }
        }
      }
    });
  } else {
    // Nếu không có options, dùng promotion price hoặc regular price
    basePrice = item.isPromotion && item.promotionPrice ? item.promotionPrice : (item.price || 0);
  }
  
  // Kiểm tra giá có hợp lệ không
  if (isNaN(Number(basePrice)) || Number(basePrice) < 0) {
    basePrice = 0;
  }
  
  // Thêm tiền hộp nếu không tắt (dùng globalBoxFee từ settings)
  const isBoxFeeDisabled = item.disableBoxFee === true || 
                         item.disableBoxFee === "true" || 
                         item.disableBoxFee === 1 || 
                         item.disableBoxFee === "1" ||
                         (typeof item.disableBoxFee === 'string' && item.disableBoxFee.toLowerCase() === 'true');
  const boxFee = isBoxFeeDisabled ? 0 : globalBoxFee;
  const finalPrice = Number(basePrice) + boxFee;
  
  return finalPrice;
};

// Generate HTML email content for order confirmation
const generateOrderConfirmationEmailHTML = (order, branding = {}) => {
  const brandName = branding.name || 'Restaurant'
  const storeAddress = branding.address || ''
  const storeEmail = branding.email || ''
  const copyrightText = branding.copyrightText || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`
  const lang = order.language || 'vi';
  const langCode = lang?.split('-')[0] || 'vi';
  const t = getEmailTranslations(lang, brandName);
  
  const formatDate = (date) => {
    const localeMap = { vi: 'vi-VN', en: 'en-US', hu: 'hu-HU' };
    const locale = localeMap[lang?.split('-')[0]] || 'vi-VN';
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatCurrency = (amount) => {
    const n = Number(amount);
    if (isNaN(n) || n < 0) return '0 Ft';
    
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(n));
  }
  
  // Get delivery fee from order.deliveryInfo, fallback to 0 if not available
  const deliveryFee = order.deliveryInfo?.deliveryFee ?? 0;
  const systemFee = order.deliveryInfo?.systemFee ?? 0;
  const subtotal = order.amount - deliveryFee - systemFee;
  const fulfillmentLabel = order.fulfillmentType === 'pickup'
    ? t.fulfillmentPickup
    : order.fulfillmentType === 'dinein'
      ? t.fulfillmentDineIn
      : t.fulfillmentDelivery;
  const hasAddress = !!(order.address && (order.address.street || order.address.address || order.address.fullAddress));
  const addressLine = order.address ? formatOrderStreetLine(order.address) || order.address.street || order.address.address || '' : '';
  const addressCity = order.address?.city || '';
  const addressState = order.address?.state || '';
  const addressZip = order.address?.zipcode || '';
  const addressCountry = order.address?.country || '';
  const customerNote = (order.note || order.notes || '').toString().trim();
  const preferredTime = (order.preferredDeliveryTime || '').toString().trim();
  const deliveryZone = order.deliveryInfo?.zone;
  const deliveryDistance = order.deliveryInfo?.distance;
  const deliveryEta = order.deliveryInfo?.estimatedTime;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${t.title} - ${brandName}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #e74c3c; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; }
        .tracking-code { background: #e74c3c; color: white; padding: 15px; text-align: center; border-radius: 8px; font-size: 24px; font-weight: bold; margin: 20px 0; }
        .items-list { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .item-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .item-name { font-weight: bold; }
        .item-quantity { color: #666; }
        .item-price { color: #333; }
        .total-section { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; }
        .total-final { font-size: 20px; font-weight: bold; color: #e74c3c; }
        .address-section { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .contact-info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${brandName}</h1>
          <h2>${t.title}</h2>
        </div>
        
        <div class="content">
          <p>${t.greeting} <strong>${order.customerInfo.name}</strong>,</p>
          
          <p>${t.thankYou}</p>
          
          <div class="tracking-code">
            ${t.trackingCode}: ${order.trackingCode}
          </div>
          
          <div class="order-details">
            <h3>📦 ${t.orderDetails}</h3>
            <div class="detail-row">
              <span class="label">${t.orderDate}:</span>
              <span class="value">${formatDate(order.createdAt || order.date)}</span>
            </div>
            <div class="detail-row">
              <span class="label">${t.orderType}:</span>
              <span class="value">${order.orderType === 'registered' ? t.orderTypeRegistered : t.orderTypeGuest}</span>
            </div>
            <div class="detail-row">
              <span class="label">${t.fulfillmentType}:</span>
              <span class="value">${fulfillmentLabel}</span>
            </div>
            <div class="detail-row">
              <span class="label">${t.paymentMethod}:</span>
              <span class="value">${t.paymentCOD}</span>
            </div>
          </div>
          
          <div class="items-list">
            ${order.items.map(item => `
              <div class="item-row">
                <div>
                  <span class="item-name">${getLocalizedItemName(item, langCode)}</span>
                  <span class="item-quantity"> x ${item.quantity || 1}</span>
                </div>
                ${formatSelectedOptions(item, langCode) ? `<div class="item-quantity">${formatSelectedOptions(item, langCode)}</div>` : ''}
              </div>
            `).join('')}
          </div>
          
          <div class="total-section">
            <div class="total-row">
              <span>${t.subtotal}:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            <div class="total-row">
              <span>${t.deliveryFee}:</span>
              <span>${formatCurrency(deliveryFee)}</span>
            </div>
            ${systemFee > 0 ? `
            <div class="total-row">
              <span>${t.systemFee}:</span>
              <span>${formatCurrency(systemFee)}</span>
            </div>
            ` : ''}
            <div class="total-row total-final">
              <span>${t.total}:</span>
              <span>${formatCurrency(order.amount)}</span>
            </div>
          </div>
          
          ${hasAddress ? `
          <div class="address-section">
            <h3>📍 ${t.deliveryAddress}</h3>
            <p>
              <strong>${addressLine}</strong><br>
              ${[addressCity, addressState].filter(Boolean).join(', ')}<br>
              ${[addressZip, addressCountry].filter(Boolean).join(', ')}
            </p>
            <p><strong>${t.phone}:</strong> ${order.customerInfo.phone}</p>
          </div>
          ` : `
          <div class="address-section">
            <h3>📍 ${t.deliveryAddress}</h3>
            <p>${fulfillmentLabel}</p>
            <p><strong>${t.phone}:</strong> ${order.customerInfo.phone}</p>
          </div>
          `}
          
          <div class="contact-info">
            <h4>📞 ${t.contactInfo}</h4>
            ${storeEmail ? `<p><strong>${t.emailLabel}:</strong> ${storeEmail}</p>` : ''}
            ${storeAddress ? `<p><strong>${t.storeAddressLabel}:</strong> ${storeAddress}</p>` : ''}
          </div>
          
          <p><strong>${t.importantNotes}:</strong></p>
          <ul>
            <li>${t.note1}: <strong>${order.trackingCode}</strong></li>
            <li>${t.note2}</li>
            <li>${t.note3}</li>
            <li>${t.note4}</li>
          </ul>
          
          <p>${t.closing}</p>
          
          <p>${t.regards}<br>
          <strong>${t.team}</strong></p>
        </div>
        
        <div class="footer">
          <p>${t.footer1}</p>
          ${getSupportLine(lang).html}
          <p>${t.footer2}</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for order confirmation
const generateOrderConfirmationEmailText = (order, branding = {}) => {
  const brandName = branding.name || 'Restaurant'
  const storeAddress = branding.address || ''
  const storeEmail = branding.email || ''
  const lang = order.language || 'vi';
  const langCode = lang?.split('-')[0] || 'vi';
  const t = getEmailTranslations(lang, brandName);
  
  const formatDate = (date) => {
    const localeMap = { vi: 'vi-VN', en: 'en-US', hu: 'hu-HU' };
    const locale = localeMap[lang?.split('-')[0]] || 'vi-VN';
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatCurrency = (amount) => {
    const n = Number(amount);
    if (isNaN(n) || n < 0) return '0 Ft';
    
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(n));
  }
  
  // Get delivery fee from order.deliveryInfo, fallback to 0 if not available
  const deliveryFee = order.deliveryInfo?.deliveryFee ?? 0;
  const systemFee = order.deliveryInfo?.systemFee ?? 0;
  const subtotal = order.amount - deliveryFee - systemFee;
  const fulfillmentLabel = order.fulfillmentType === 'pickup'
    ? t.fulfillmentPickup
    : order.fulfillmentType === 'dinein'
      ? t.fulfillmentDineIn
      : t.fulfillmentDelivery;
  const hasAddress = !!(order.address && (order.address.street || order.address.address || order.address.fullAddress));
  const addressLine = order.address ? formatOrderStreetLine(order.address) || order.address.street || order.address.address || '' : '';
  const addressCity = order.address?.city || '';
  const addressState = order.address?.state || '';
  const addressZip = order.address?.zipcode || '';
  const addressCountry = order.address?.country || '';
  
  return `
${brandName} - ${t.title}

${t.greeting} ${order.customerInfo.name},

${t.thankYou}

${t.trackingCode.toUpperCase()}: ${order.trackingCode}

${t.orderDetails.toUpperCase()}:
${t.orderDate}: ${formatDate(order.createdAt || order.date)}
${t.orderType}: ${order.orderType === 'registered' ? t.orderTypeRegistered : t.orderTypeGuest}
${t.fulfillmentType}: ${fulfillmentLabel}
${t.paymentMethod}: ${t.paymentCOD}

${t.orderItems.toUpperCase()}:
${order.items.map(item => `- ${getLocalizedItemName(item, langCode)}${formatSelectedOptions(item, langCode)} x ${item.quantity || 1}`).join('\n')}

${t.orderDetails.toUpperCase()}:
${t.subtotal}: ${formatCurrency(subtotal)}
${t.deliveryFee}: ${formatCurrency(deliveryFee)}
${systemFee > 0 ? `${t.systemFee}: ${formatCurrency(systemFee)}\n` : ''}${t.total}: ${formatCurrency(order.amount)}

${t.deliveryAddress.toUpperCase()}:
${hasAddress ? `${addressLine}
${[addressCity, addressState].filter(Boolean).join(', ')}
${[addressZip, addressCountry].filter(Boolean).join(', ')}` : fulfillmentLabel}
${t.phone}: ${order.customerInfo.phone}

${t.contactInfo.toUpperCase()}:
${storeEmail ? `${t.emailLabel}: ${storeEmail}` : ''}
${storeAddress ? `${t.storeAddressLabel}: ${storeAddress}` : ''}

${t.importantNotes.toUpperCase()}:
- ${t.note1}: ${order.trackingCode}
- ${t.note2}
- ${t.note3}
- ${t.note4}

${t.closing}

${t.regards}
${t.team}

---
${t.footer1}
${getSupportLine(lang).text}
${t.footer2}
  `
}

const getItemProductId = (item = {}) => {
  return item._id || item.id || item.foodId || item.productId;
};

const getItemSku = (item = {}, product = null) => {
  return (item.sku || item.SKU || item.productSku || product?.sku || '').toString().trim();
};

const getProductForEmailItem = async (item = {}) => {
  try {
    const productId = getItemProductId(item);
    if (productId && /^[0-9a-fA-F]{24}$/.test(productId.toString())) {
      const product = await foodModel.findById(productId);
      if (product) return product;
    }

    const sku = getItemSku(item);
    if (sku) {
      const product = await foodModel.findOne({ sku });
      if (product) return product;
    }
  } catch (error) {
    console.log('⚠️ Could not query product for admin email item:', error.message);
  }

  return null;
};

// Helper function to get Vietnamese product name (for admin emails)
const getVietnameseProductName = (item, product = null) => {
  // Ưu tiên nameVI nếu có
  if (item.nameVI) {
    return item.nameVI;
  }

  if (product?.nameVI) {
    return product.nameVI;
  }

  // Fallback về name nếu không tìm thấy
  return item.name || item.nameEN || item.nameHU || product?.name || product?.nameEN || product?.nameHU || 'Sản phẩm';
};

const formatAdminItemName = (item, product = null) => {
  const sku = getItemSku(item, product);
  const name = getVietnameseProductName(item, product);

  if (!sku) return name;
  if (!name) return sku;

  const normalizedSku = sku.toLowerCase();
  const normalizedName = name.toLowerCase().trim();
  const alreadyPrefixed =
    normalizedName === normalizedSku ||
    normalizedName.startsWith(`${normalizedSku}.`) ||
    normalizedName.startsWith(`${normalizedSku} `);

  return alreadyPrefixed ? name : `${sku}. ${name}`;
};

// Helper function to format selected options for display (for admin emails - always Vietnamese)
// Luôn query từ database để lấy đầy đủ thông tin đa ngôn ngữ
const formatSelectedOptionsForAdmin = async (item, product = null) => {
  if (!item.selectedOptions || Object.keys(item.selectedOptions).length === 0) {
    return '';
  }
  
  // Luôn query từ database để đảm bảo có đầy đủ thông tin đa ngôn ngữ
  let options = product?.options || null;
  try {
    // Nếu không query được, thử dùng options từ item
    if (!options && item.options && Array.isArray(item.options) && item.options.length > 0) {
      options = item.options;
    }
  } catch (error) {
    console.log('⚠️ Could not query product options:', error.message);
    // Fallback về options từ item nếu có
    if (item.options && Array.isArray(item.options) && item.options.length > 0) {
      options = item.options;
    } else {
      return '';
    }
  }
  
  if (!options || !Array.isArray(options) || options.length === 0) {
    return '';
  }
  
  const optionTexts = [];
  
  for (const [optionName, choiceCode] of Object.entries(item.selectedOptions)) {
    // Tìm option theo name (có thể là name gốc, nameVI, nameEN, hoặc nameHU)
    // optionName trong selectedOptions thường là name gốc của option
    const option = options.find(opt => 
      opt.name === optionName || 
      opt.nameVI === optionName || 
      opt.nameEN === optionName || 
      opt.nameHU === optionName
    );
    
    if (option) {
      const choice = option.choices.find(c => c.code === choiceCode);
      if (choice) {
        // Luôn ưu tiên nameVI và labelVI cho admin email
        const optionNameVI = option.nameVI || option.name || optionName;
        const choiceLabelVI = choice.labelVI || choice.label || choice.code;
        optionTexts.push(`${optionNameVI}: ${choiceLabelVI}`);
      }
    } else {
      // Nếu không tìm thấy option, vẫn hiển thị với optionName và choiceCode
      // (trường hợp này hiếm khi xảy ra)
      optionTexts.push(`${optionName}: ${choiceCode}`);
    }
  }
  
  return optionTexts.length > 0 ? ` (${optionTexts.join(', ')})` : '';
};

// Helper function to get localized product name for customer emails
function getLocalizedItemName(item, langCode = 'vi') {
  const keyMap = { vi: 'nameVI', en: 'nameEN', hu: 'nameHU' };
  const preferredKey = keyMap[langCode] || 'nameVI';
  return item[preferredKey] || item.name || item.nameVI || item.nameEN || item.nameHU || 'Sản phẩm';
}

// Helper function to format selected options for display (for customer emails - uses customer language)
function formatSelectedOptions(item, langCode = 'vi') {
  if (!item.selectedOptions || Object.keys(item.selectedOptions).length === 0) {
    return '';
  }
  
  if (!item.options || !Array.isArray(item.options) || item.options.length === 0) {
    return '';
  }
  
  const optionTexts = [];
  Object.entries(item.selectedOptions).forEach(([optionName, choiceCode]) => {
    const option = item.options.find(opt => 
      opt.name === optionName || 
      opt.nameVI === optionName || 
      opt.nameEN === optionName || 
      opt.nameHU === optionName
    );
    if (option) {
      const choice = option.choices.find(c => c.code === choiceCode);
      if (choice) {
        const optionNameMap = {
          vi: option.nameVI || option.name,
          en: option.nameEN || option.name,
          hu: option.nameHU || option.name
        };
        const choiceLabelMap = {
          vi: choice.labelVI || choice.label,
          en: choice.labelEN || choice.label,
          hu: choice.labelHU || choice.label
        };
        const displayOptionName = optionNameMap[langCode] || option.name || optionName;
        const displayChoiceLabel = choiceLabelMap[langCode] || choice.label || choice.code;
        optionTexts.push(`${displayOptionName}: ${displayChoiceLabel}`);
      }
    }
  });
  
  return optionTexts.length > 0 ? ` (${optionTexts.join(', ')})` : '';
}

// Generate HTML email content for admin order notification
// LUÔN LUÔN BẰNG TIẾNG VIỆT, không phụ thuộc vào ngôn ngữ của khách hàng
const generateAdminOrderNotificationEmailHTML = async (order, branding = {}) => {
  const brandName = branding.name || 'Restaurant'
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatCurrency = (amount) => {
    const n = Number(amount);
    if (isNaN(n) || n < 0) return '0 Ft';
    
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(n));
  }
  
  // Get delivery fee from order.deliveryInfo, fallback to 0 if not available
  const deliveryFee = order.deliveryInfo?.deliveryFee ?? 0;
  const systemFee = order.deliveryInfo?.systemFee ?? 0;
  const subtotal = order.amount - deliveryFee - systemFee;
  const fulfillmentLabel = order.fulfillmentType === 'pickup'
    ? 'Lấy tại quán'
    : order.fulfillmentType === 'dinein'
      ? 'Dùng tại quán'
      : 'Giao hàng';
  const hasAddress = !!(order.address && (order.address.street || order.address.address || order.address.fullAddress));
  const addressLine = order.address ? formatOrderStreetLine(order.address) || order.address.street || order.address.address || '' : '';
  const addressCity = order.address?.city || '';
  const addressState = order.address?.state || '';
  const addressZip = order.address?.zipcode || '';
  const addressCountry = order.address?.country || '';
  const customerNote = (order.note || order.notes || '').toString().trim();
  const preferredTime = (order.preferredDeliveryTime || '').toString().trim();
  const deliveryZone = order.deliveryInfo?.zone;
  const deliveryDistance = order.deliveryInfo?.distance;
  const deliveryEta = order.deliveryInfo?.estimatedTime;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Đơn hàng mới #${order.trackingCode}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2c3e50; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
        .content { padding: 24px; }
        .order-code { background: #f8f9fa; padding: 12px; border-radius: 6px; text-align: center; margin-bottom: 20px; }
        .order-code strong { font-size: 18px; color: #e74c3c; }
        .section { margin: 20px 0; }
        .section-title { font-size: 14px; font-weight: 600; color: #7f8c8d; text-transform: uppercase; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #ecf0f1; }
        .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .info-label { width: 100px; color: #7f8c8d; font-size: 14px; }
        .info-value { flex: 1; color: #2c3e50; font-weight: 500; font-size: 14px; }
        .items-list { margin: 12px 0; }
        .item-row { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .item-name { color: #2c3e50; font-weight: 500; }
        .item-qty { color: #7f8c8d; margin-left: 8px; }
        .item-options { font-size: 12px; color: #7f8c8d; margin-left: 20px; font-style: italic; }
        .total-section { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0; }
        .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
        .total-row.final { border-top: 2px solid #2c3e50; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 600; color: #e74c3c; }
        .address-box { background: #e8f4f8; padding: 14px; border-left: 4px solid #3498db; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #2c3e50; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🍜 Đơn hàng mới - ${brandName}</h1>
        </div>
        
        <div class="content">
          <div class="order-code">
            <strong>Đơn hàng #${order.trackingCode}</strong>
          </div>
          
          <div class="section">
            <div class="section-title">Thông tin khách hàng</div>
            <div class="info-row">
              <div class="info-label">Tên:</div>
              <div class="info-value">${order.customerInfo.name}</div>
            </div>
            <div class="info-row">
              <div class="info-label">SĐT:</div>
              <div class="info-value">${order.customerInfo.phone}</div>
            </div>
            ${order.customerInfo.email ? `
            <div class="info-row">
              <div class="info-label">Email:</div>
              <div class="info-value">${order.customerInfo.email}</div>
            </div>
            ` : ''}
            <div class="info-row">
              <div class="info-label">Địa chỉ:</div>
              <div class="info-value">
                ${hasAddress
                  ? `${addressLine}${addressCity ? `, ${addressCity}` : ''}${addressState ? `, ${addressState}` : ''}${addressZip ? ` ${addressZip}` : ''}`
                  : fulfillmentLabel}
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">Hình thức:</div>
              <div class="info-value">${fulfillmentLabel}</div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">Món ăn đã đặt</div>
            <div class="items-list">
              ${(await Promise.all(order.items.map(async (item) => {
                // Luôn dùng tiếng Việt cho admin email
                const product = await getProductForEmailItem(item);
                const productNameVI = formatAdminItemName(item, product);
                const optionsText = await formatSelectedOptionsForAdmin(item, product);
                const cleanOptionsText = optionsText ? optionsText.replace(/^ \(/, '').replace(/\)$/, '') : '';
                return `
                <div class="item-row">
                  <div class="item-name">
                    ${productNameVI}<span class="item-qty"> x${item.quantity || 1}</span>
                  </div>
                  ${cleanOptionsText ? `<div class="item-options">${cleanOptionsText}</div>` : ''}
                </div>
              `;
              }))).join('')}
            </div>
            
            <div class="total-section">
              <div class="total-row">
                <span>Tạm tính:</span>
                <span>${formatCurrency(subtotal)}</span>
              </div>
              <div class="total-row">
                <span>Phí giao hàng:</span>
                <span>${formatCurrency(deliveryFee)}</span>
              </div>
              ${systemFee > 0 ? `
              <div class="total-row">
                <span>Phí hệ thống:</span>
                <span>${formatCurrency(systemFee)}</span>
              </div>
              ` : ''}
              <div class="total-row final">
                <span>Tổng cộng:</span>
                <span>${formatCurrency(order.amount)}</span>
              </div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">Thông tin đơn hàng</div>
            <div class="info-row">
              <div class="info-label">Thời gian:</div>
              <div class="info-value">${formatDate(order.createdAt || order.date)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Thanh toán:</div>
              <div class="info-value">COD (Tiền mặt khi nhận)</div>
            </div>
            <div class="info-row">
              <div class="info-label">Loại đơn:</div>
              <div class="info-value">${order.orderType === 'registered' ? 'Thành viên' : 'Khách vãng lai'}</div>
            </div>
            ${customerNote ? `
            <div class="info-row">
              <div class="info-label">Ghi chú:</div>
              <div class="info-value">${customerNote}</div>
            </div>
            ` : ''}
            ${preferredTime ? `
            <div class="info-row">
              <div class="info-label">Giờ nhận:</div>
              <div class="info-value">${preferredTime}</div>
            </div>
            ` : ''}
            ${deliveryZone ? `
            <div class="info-row">
              <div class="info-label">Khu vực:</div>
              <div class="info-value">${deliveryZone}</div>
            </div>
            ` : ''}
            ${typeof deliveryDistance === 'number' ? `
            <div class="info-row">
              <div class="info-label">Khoảng cách:</div>
              <div class="info-value">${deliveryDistance} km</div>
            </div>
            ` : ''}
            ${typeof deliveryEta === 'number' ? `
            <div class="info-row">
              <div class="info-label">Thời gian:</div>
              <div class="info-value">${deliveryEta} phút</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generate plain text email content for admin order notification
// LUÔN LUÔN BẰNG TIẾNG VIỆT, không phụ thuộc vào ngôn ngữ của khách hàng
const generateAdminOrderNotificationEmailText = async (order, branding = {}) => {
  const brandName = branding.name || 'Restaurant'
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatCurrency = (amount) => {
    const n = Number(amount);
    if (isNaN(n) || n < 0) return '0 Ft';
    
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(n));
  }
  
  // Get delivery fee from order.deliveryInfo, fallback to 0 if not available
  const deliveryFee = order.deliveryInfo?.deliveryFee ?? 0;
  const systemFee = order.deliveryInfo?.systemFee ?? 0;
  const subtotal = order.amount - deliveryFee - systemFee;
  const fulfillmentLabel = order.fulfillmentType === 'pickup'
    ? 'Lấy tại quán'
    : order.fulfillmentType === 'dinein'
      ? 'Dùng tại quán'
      : 'Giao hàng';
  const hasAddress = !!(order.address && (order.address.street || order.address.address || order.address.fullAddress));
  const addressLine = order.address ? formatOrderStreetLine(order.address) || order.address.street || order.address.address || '' : '';
  const addressCity = order.address?.city || '';
  const addressState = order.address?.state || '';
  const addressZip = order.address?.zipcode || '';
  const addressCountry = order.address?.country || '';
  const customerNote = (order.note || order.notes || '').toString().trim();
  const preferredTime = (order.preferredDeliveryTime || '').toString().trim();
  const deliveryZone = order.deliveryInfo?.zone;
  const deliveryDistance = order.deliveryInfo?.distance;
  const deliveryEta = order.deliveryInfo?.estimatedTime;
  
  return `
🍜 ĐƠN HÀNG MỚI - ${brandName}

Đơn hàng #${order.trackingCode}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THÔNG TIN KHÁCH HÀNG:
Tên: ${order.customerInfo.name}
SĐT: ${order.customerInfo.phone}
 ${order.customerInfo.email ? `Email: ${order.customerInfo.email}\n` : ''}Địa chỉ: ${hasAddress ? `${addressLine}${addressCity ? `, ${addressCity}` : ''}${addressState ? `, ${addressState}` : ''}${addressZip ? ` ${addressZip}` : ''}` : fulfillmentLabel}
Hình thức: ${fulfillmentLabel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MÓN ĂN ĐÃ ĐẶT:
${(await Promise.all(order.items.map(async (item) => {
    // Luôn dùng tiếng Việt cho admin email
    const product = await getProductForEmailItem(item);
    const productNameVI = formatAdminItemName(item, product);
    const optionsText = await formatSelectedOptionsForAdmin(item, product);
    return `- ${productNameVI}${optionsText ? optionsText : ''} x${item.quantity || 1}`;
  }))).join('\n')}

Tạm tính: ${formatCurrency(subtotal)}
Phí giao hàng: ${formatCurrency(deliveryFee)}
${systemFee > 0 ? `Phí hệ thống: ${formatCurrency(systemFee)}\n` : ''}TỔNG CỘNG: ${formatCurrency(order.amount)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thời gian: ${formatDate(order.createdAt || order.date)}
Thanh toán: COD (Tiền mặt khi nhận)
Loại đơn: ${order.orderType === 'registered' ? 'Thành viên' : 'Khách vãng lai'}
${customerNote ? `Ghi chú: ${customerNote}\n` : ''}${preferredTime ? `Giờ nhận: ${preferredTime}\n` : ''}${deliveryZone ? `Khu vực: ${deliveryZone}\n` : ''}${typeof deliveryDistance === 'number' ? `Khoảng cách: ${deliveryDistance} km\n` : ''}${typeof deliveryEta === 'number' ? `Thời gian dự kiến: ${deliveryEta} phút\n` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email tự động từ hệ thống ${brandName}
  `
}
