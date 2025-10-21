const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);

// Настройка CORS для VK
const io = socketIo(server, {
  cors: {
    origin: [
      "https://vk.com",
      "https://anoooon99999-netizen.github.io",
      "https://anonymous-chat-vk.onrender.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: [
    "https://vk.com",
    "https://anexox99999.github.io",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(bodyParser.json());

// Инициализация базы данных
const db = new sqlite3.Database(':memory:');

// Создание таблиц
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    user_gender TEXT,
    user_age INTEGER,
    partner_gender TEXT,
    min_age INTEGER,
    max_age INTEGER,
    theme TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    user_id TEXT,
    user_name TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id)
  )`);

  // Тестовые данные
  db.run(`INSERT INTO chats (user_id, user_gender, user_age, partner_gender, min_age, max_age, theme) 
          VALUES ('test_user', 'Мужской', 25, 'Любой', 18, 35, 'Общение')`);
});

// API Routes
app.get('/api/chats', (req, res) => {
  db.all(`
    SELECT c.*, 
           COUNT(DISTINCT m.user_id) as members_count
    FROM chats c
    LEFT JOIN messages m ON c.id = m.chat_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/chats', (req, res) => {
  const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
  
  db.run(
    `INSERT INTO chats (user_id, user_gender, user_age, partner_gender, min_age, max_age, theme) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, user_gender, user_age, partner_gender, min_age, max_age, theme],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/messages', (req, res) => {
  const { chat_id } = req.query;
  
  db.all(
    `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`,
    [chat_id],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

app.post('/api/messages', (req, res) => {
  const { chat_id, user_id, user_name, message } = req.body;
  
  db.run(
    `INSERT INTO messages (chat_id, user_id, user_name, message) VALUES (?, ?, ?, ?)`,
    [chat_id, user_id, user_name, message],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Отправляем сообщение через WebSocket
      const newMessage = {
        id: this.lastID,
        chat_id,
        user_id,
        user_name,
        message,
        created_at: new Date().toISOString()
      };
      
      io.to(`chat_${chat_id}`).emit('new_message', newMessage);
      res.json({ id: this.lastID });
    }
  );
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_chat', (data) => {
    socket.join(`chat_${data.chatId}`);
    console.log(`User ${data.userId} joined chat ${data.chatId}`);
  });

  socket.on('leave_chat', (data) => {
    socket.leave(`chat_${data.chatId}`);
    console.log(`User ${data.userId} left chat ${data.chatId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
});
