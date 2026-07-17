const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'greetings.json');

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    })
});

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

function getGreetings() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveGreetings(greetings) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(greetings, null, 2));
}

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'board.html'));
});

app.get('/api/greetings', (req, res) => {
    res.json(getGreetings());
});

app.delete('/api/greetings/:id', (req, res) => {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'סיסמה שגויה' });
    }
    const greetings = getGreetings();
    const filtered = greetings.filter(g => g.id !== parseInt(req.params.id));
    saveGreetings(filtered);
    res.json({ success: true });
});

app.put('/api/greetings/:id', (req, res) => {
    const { sender, text, image } = req.body;
    const greetings = getGreetings();
    const note = greetings.find(g => g.id === parseInt(req.params.id));
    if (!note) return res.status(404).json({ error: 'לא נמצא' });
    if (sender !== undefined) note.sender = sender;
    if (text !== undefined) note.text = text;
    if (image !== undefined) note.image = image;
    saveGreetings(greetings);
    res.json({ success: true });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'אין קובץ' });
    res.json({ url: `/public/uploads/${req.file.filename}` });
});

app.post('/api/greetings/:id/react', (req, res) => {
    const { type } = req.body;
    const greetings = getGreetings();
    const note = greetings.find(g => g.id === parseInt(req.params.id));
    if (note && note.reactions && note.reactions[type] !== undefined) {
        note.reactions[type]++;
        saveGreetings(greetings);
        return res.json({ success: true, reactions: note.reactions });
    }
    res.status(404).json({ error: 'לא נמצא' });
});

// Green-API webhook - מקבל הודעות מהוואטסאפ
app.post('/webhook', (req, res) => {
    res.sendStatus(200);

    const body = req.body;
    const isIncoming = body.typeWebhook === 'incomingMessageReceived';
    const isOutgoing = body.typeWebhook === 'outgoingMessageReceived';
    if (!isIncoming && !isOutgoing) return;

    const messageData = body.messageData;
    if (!messageData || messageData.typeMessage !== 'textMessage') return;

    const text = (messageData.textMessageData?.textMessage || '').trim();
    const isGreeting = text.startsWith('ברכה:') || text.startsWith('ברכה ') || text.startsWith('ברכה\n');
    if (!isGreeting) return;

    const cleanText = text.startsWith('ברכה:')
        ? text.substring(5).trim()
        : text.substring(5).trim();

    const senderName = body.senderData?.senderName || body.senderData?.chatName || 'משתתף בקבוצה';
    const colors = ['yellow', 'blue', 'pink', 'green', 'purple'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const greetings = getGreetings();
    const newId = greetings.length > 0 ? Math.max(...greetings.map(g => g.id)) + 1 : 1;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    greetings.unshift({
        id: newId,
        sender: senderName,
        text: cleanText,
        colorKey: randomColor,
        image: null,
        reactions: { heart: 0, like: 0, party: 0 },
        date: timeString
    });
    saveGreetings(greetings);
    console.log(`ברכה חדשה מ-${senderName}`);

    const chatId = body.senderData?.chatId;
    if (chatId && process.env.INSTANCE_ID && process.env.API_TOKEN && process.env.API_URL) {
        fetch(`${process.env.API_URL}/waInstance${process.env.INSTANCE_ID}/sendMessage/${process.env.API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                message: `תודה! הברכה שלך נוספה ללוח 🎉\nלצפייה: ${process.env.BOARD_URL || ''}`
            })
        }).catch(err => console.error('שגיאה בשליחת אישור:', err));
    }
});

app.listen(PORT, () => console.log(`שרת פועל על פורט ${PORT}`));
