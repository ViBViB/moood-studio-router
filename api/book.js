const { Resend } = require('resend');
const { google } = require('googleapis');
const Busboy = require('busboy');

// Initialize Resend with the API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Helper to format the private key correctly for Google Auth
function formatPrivateKey(key) {
    if (!key) return null;
    let formatted = key.replace(/\\n/g, '\n');
    if (!formatted.includes('-----BEGIN PRIVATE KEY-----')) {
        formatted = `-----BEGIN PRIVATE KEY-----\n${formatted}`;
    }
    if (!formatted.includes('-----END PRIVATE KEY-----')) {
        formatted = `${formatted}\n-----END PRIVATE KEY-----`;
    }
    return formatted;
}

const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    formatPrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    SCOPES
);
const calendar = google.calendar({ version: 'v3', auth });

module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for required ENV variables
    const requiredEnv = [
        'RESEND_API_KEY',
        'GOOGLE_SERVICE_ACCOUNT_EMAIL',
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    ];
    const missing = requiredEnv.filter(name => !process.env[name]);
    if (missing.length > 0) {
        return res.status(500).json({
            error: 'The machine is missing its core keys.',
            details: `Missing environment variables in Vercel: ${missing.join(', ')}`
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

        const { fullName, email, companyName, slot } = fields;

        if (!fullName || !email || !slot || !slot.date || !slot.time) {
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
Email: ${email}
Company: ${companyName}
PRD Attached: ${files.length > 0 ? files[0].name : 'No'}`,
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
            attendees: [{ email }],
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

        // 2. Send Email Notification
        const emailContent = `
            <h2>New Onboarding Session Initiated</h2>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Scheduled:</strong> ${slot.time} on ${new Date(slot.date).toLocaleDateString()}</p>
            ${files.length > 0 ? `<p><strong>PRD Filename:</strong> ${files[0].name}</p>` : '<p>No PRD uploaded.</p>'}
        `;

        await resend.emails.send({
            from: 'Moood Studio <notifications@moood.studio>',
            to: ['alberto.contreras@gmail.com'],
            subject: `New Secession Initiated: ${companyName}`,
            html: emailContent,
            attachments: files.map(file => ({
                filename: file.name,
                content: file.content.toString('base64')
            }))
        });

        return res.status(200).json({ success: true, message: 'Takeover initiated' });

    } catch (error) {
        console.error('Booking error:', error);
        return res.status(500).json({ error: 'Failed to initiate takeover', details: error.message });
    }
};
