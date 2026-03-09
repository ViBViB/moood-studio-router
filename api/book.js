const { Resend } = require('resend');
const { google } = require('googleapis');
const Busboy = require('busboy');

// Initialize Resend with the API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to format the private key correctly for Google Auth
function formatPrivateKey(key) {
    if (!key) return null;

    // 1. Convert to string and replace literal \n with real newlines
    let k = String(key).replace(/\\n/g, '\n');

    // 2. Remove headers if they already exist to normalize the content
    k = k.replace(/-----BEGIN PRIVATE KEY-----/g, '');
    k = k.replace(/-----END PRIVATE KEY-----/g, '');

    // 3. Remove all whitespace at start/end and any surrounding quotes
    k = k.trim().replace(/^["']|["']$/g, '');

    // 4. Re-construct the PEM format impeccably
    return `-----BEGIN PRIVATE KEY-----\n${k}\n-----END PRIVATE KEY-----`;
}

module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Check for required ENV variables FIRST
    const requiredEnv = [
        'RESEND_API_KEY',
        'GOOGLE_SERVICE_ACCOUNT_EMAIL',
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    ];
    const missing = requiredEnv.filter(name => !process.env[name]);
    if (missing.length > 0) {
        return res.status(500).json({
            error: 'The machine is missing its core keys.',
            details: `Missing environment variables in Vercel: ${missing.join(', ')}. Please redeploy the project if you just added them.`
        });
    }

    const SCOPES = ['https://www.googleapis.com/auth/calendar'];
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'alberto.contreras@gmail.com';

    let calendar;
    try {
        const serviceAccountEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim().replace(/^["']|["']$/g, '');
        let rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

        // Final safety check: if Vercel passed the string "undefined" or "null"
        if (rawKey === 'undefined' || rawKey === 'null' || rawKey.length < 10) {
            throw new Error('The private key in Vercel appears to be empty or malformed (detected as null/undefined string).');
        }

        const formattedKey = formatPrivateKey(rawKey);

        const auth = new google.auth.JWT({
            email: serviceAccountEmail,
            key: formattedKey,
            scopes: SCOPES
        });

        await auth.authorize();
        calendar = google.calendar({ version: 'v3', auth });
    } catch (authErr) {
        console.error('Google Auth Error:', authErr);
        return res.status(500).json({
            error: 'Failed to authenticate with Google.',
            details: authErr.message
        });
    }

    try {
        const fields = {};
        const files = [];

        // Parse multipart/form-data using busboy
        const busboy = Busboy({ headers: req.headers });

        await new Promise((resolve, reject) => {
            busboy.on('file', (name, file, info) => {
                const { filename, encoding, mimeType } = info;
                const chunks = [];
                file.on('data', (data) => chunks.push(data));
                file.on('end', () => {
                    files.push({
                        name: filename,
                        content: Buffer.concat(chunks),
                        type: mimeType
                    });
                });
            });

            busboy.on('field', (name, val) => {
                fields[name] = val;
            });

            busboy.on('finish', resolve);
            busboy.on('error', reject);
            req.pipe(busboy);
        });

        // Parse the slot data if it's sent as a string (it usually is in FormData)
        if (fields.selectedSlot) {
            try {
                fields.slot = JSON.parse(fields.selectedSlot);
            } catch (e) {
                // Fallback if it's not JSON
            }
        }

        const { fullName, email: customerEmail, companyName, slot } = fields;

        if (!fullName || !customerEmail || !slot || !slot.date || !slot.time) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Create Google Calendar Event
        const eventDate = new Date(slot.date);
        const [timePart, modifier] = slot.time.split(' ');
        let [hours, minutes] = timePart.split(':');
        hours = parseInt(hours, 10);
        if (hours === 12) hours = 0;
        if (modifier === 'PM') hours += 12;

        const startDateTime = new Date(eventDate);
        startDateTime.setHours(hours, parseInt(minutes, 10), 0, 0);

        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(startDateTime.getHours() + 1); // 1-hour session

        const event = {
            summary: `Moood Onboarding: ${companyName} (${fullName})`,
            description: `Session booked via Moood Studio.
Customer: ${fullName}
Email: ${customerEmail}
Company: ${companyName}
PRD Attached: ${files.length > 0 ? files[0].name : 'No'}`,
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
            // Note: Service accounts cannot invite attendees without Domain-Wide Delegation.
            // We remove attendees to ensure the event is created.
        };

        try {
            await calendar.events.insert({
                calendarId: calendarId,
                resource: event,
            });
        } catch (calErr) {
            console.error('Google Calendar API Error:', calErr);
            throw new Error(`Google Calendar rejection: ${calErr.message}`);
        }

        // 2. Prepare formatted date/time for emails
        const formattedDate = new Date(slot.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const bookingTime = slot.time;

        // 3. Send Email Notification to AGENCY (Alberto)
        const agencyEmailContent = `
            <div style="font-family: sans-serif; max-width: 600px; color: #111;">
                <h2 style="border-bottom: 2px solid #000; padding-bottom: 10px;">New Onboarding Session</h2>
                <p>A new takeover session has been initiated through the Identity Portal.</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; font-weight: bold;">Customer:</td><td>${fullName}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td>${customerEmail}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Company:</td><td>${companyName}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Date:</td><td>${formattedDate}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Time:</td><td>${bookingTime}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">PRD:</td><td>${files.length > 0 ? files[0].name : 'No file attached'}</td></tr>
                </table>
                <p style="margin-top: 20px; font-size: 12px; color: #666;">This event has been added to your Google Calendar.</p>
            </div>
        `;

        try {
            const { data, error: sendError } = await resend.emails.send({
                from: 'Moood Studio <notifications@moood.studio>',
                to: ['alberto.contreras@gmail.com'],
                subject: `New Onboarding Service: ${companyName}`,
                html: agencyEmailContent,
                attachments: files.map(file => ({
                    filename: file.name,
                    content: file.content
                }))
            });

            if (sendError) {
                console.error('Resend Agency Error:', sendError);
                // We don't block the customer email, but we log the problem
            } else {
                console.log('Agency Email Sent:', data.id);
            }
        } catch (err) {
            console.error('Agency Email Catch:', err);
        }

        // 4. Send Email Confirmation to CUSTOMER
        const customerEmailContent = `
            <div style="font-family: sans-serif; max-width: 600px; color: #111; line-height: 1.6;">
                <h1 style="font-size: 24px;">Onboarding Confirmed</h1>
                <p>Hello ${fullName},</p>
                <p>We've successfully received your request. Your <strong>Onboarding Session</strong> with Moood Studio is confirmed for:</p>
                <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Date:</strong> ${formattedDate}</p>
                    <p style="margin: 0;"><strong>Time:</strong> ${bookingTime} (GMT)</p>
                </div>
                <p>Our team is reviewing your information. You will receive a calendar invitation shortly with the meeting link.</p>
                <p>Get ready for the takeover.</p>
                <br>
                <p>Best regards,<br>The Moood Studio Team</p>
            </div>
        `;

        try {
            const { data, error: sendError } = await resend.emails.send({
                from: 'Moood Studio <notifications@moood.studio>',
                to: [customerEmail],
                subject: `Your Booking is Confirmed: ${formattedDate}`,
                html: customerEmailContent
            });

            if (sendError) {
                console.error('Resend Customer Error:', sendError);
                throw new Error(`Email rejection: ${sendError.message}. (Common cause: ${sendError.name})`);
            } else {
                console.log('Customer Email Sent:', data.id);
            }
        } catch (err) {
            console.error('Customer Email Catch:', err);
            throw new Error(`The machine failed to send the confirmation: ${err.message}. Check if moood.studio is verified in Resend.`);
        }

        return res.status(200).json({
            success: true,
            message: 'Takeover initiated',
            booking: {
                date: formattedDate,
                time: bookingTime,
                customer: fullName
            }
        });

    } catch (error) {
        console.error('Booking error:', error);
        return res.status(500).json({ error: 'Failed to initiate takeover', details: error.message });
    }
};
