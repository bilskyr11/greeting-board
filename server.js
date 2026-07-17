const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'greetings.json');

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
    if (body.typeWebhook !== 'incomingMessageReceived') return;

    const messageData = body.messageData;
    if (!messageData || messageData.typeMessage !== 'textMessage') return;

    const text = (messageData.textMessageData?.textMessage || '').trim();
    const isGreeting = text.startsWith('ברכה:') || text.startsWith('ברכה ') || text.startsWith('ברכה\n');
    if (!isGreeting) return;

    const cleanText = text.startsWith('ברכה:')
        ? text.substring(5).trim()
        : text.substring(5).trim();

    const senderName = body.senderData?.senderName || 'משתתף בקבוצה';
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

    // שליחת אישור חזרה לשולח
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
