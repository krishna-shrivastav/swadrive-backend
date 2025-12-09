

// ------------------ AUTO CREATE TABLES ------------------
require('./migrate');

// ------------------ IMPORTS ------------------
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();

// ------------------ FIXED CORS CONFIG ------------------
app.use(cors({
  origin: [
    "http://localhost:4000",
    "http://127.0.0.1:5500",
    "https://krishna-shrivastav.github.io"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(bodyParser.json());

// ------------------ JWT TOKEN FUNCTION ------------------
function createToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}
// ------------------ NOTIFICATION HELPER ------------------
async function createNotification({ user_id, task_id, type, title, message }) {
  await pool.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, task_id || null, type, title, message]
  );
}

// ------------------ AUTH MIDDLEWARE ------------------
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'No token provided' });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ------------------ ROLE CHECK ------------------
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Access denied: wrong role' });
    }
    next();
  };
}

app.get("/", (req, res) => {
  res.send("✅ SwaDrive Backend is running");
});


// ------------------ REGISTER ------------------
app.post('/api/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;

    const [check] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (check.length > 0) return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [full_name, email, phone, hashedPassword, role || 'customer']
    );

    const user_id = result.insertId;
    const token = createToken({ user_id, role });

    res.json({ message: "User registered", user_id, token });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ------------------ LOGIN ------------------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (rows.length === 0) return res.status(400).json({ message: "User not found" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) return res.status(400).json({ message: "Wrong password" });

    const token = createToken(user);
    res.json({ message: "Login successful", token, user });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ------------------ CUSTOMER: CREATE TASK ------------------
// ------------------ CUSTOMER: CREATE TASK (SwaDrive) ------------------
app.post('/api/tasks', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    // 1. Frontend se jo fields aa rahe hain unko destructure karo
const {
  category,
  component,
  mechanicProblem,
  description,
  location,
  urgency,
   reward_amount
} = req.body;

    // 2. Title auto-generate karo (DB ke liye)
    const title =
      (category || "Service") +
      " - " +
      (mechanicProblem || component || "General Help");

    // 3. Reward amount ko safe number bana do (default 0)
    const reward = reward_amount ? Number(reward_amount) : 0;

    // 4. Debug ke liye log (Railway logs me dikhega)
    console.log("Creating task:", {
      user_id: req.user.user_id,
      title,
      description,
      location,
      reward,
      urgency
    });

     const [result] = await pool.query(
      `INSERT INTO tasks
       (user_id, title, description, location, reward_amount, urgency)
VALUES (?, ?, ?, ?, ?, ?)`,
      [ req.user.user_id,
    title,
    description,
    location,
    reward,
    urgency]
    );

    return res.json({ message: "Task created", task_id: result.insertId });
  } catch (err) {
    console.error("Error while creating task:", err); // important
    return res.status(500).json({
      message: "Task create failed",
      error: err.message
    });
  }
});

// ------------------ CUSTOMER: GET SINGLE TASK (for edit) ------------------
app.get('/api/tasks/:task_id', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const task_id = req.params.task_id;

    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE task_id=? AND user_id=?",
      [task_id, req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("Error while loading task:", err);
    return res.status(500).json({ message: "Failed to load task" });
  }
});


    // ------------------ CUSTOMER: UPDATE TASK ------------------
app.put('/api/tasks/:task_id', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const task_id = req.params.task_id;

    // Pehle verify karo ke ye task isi user ka hai
    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE task_id=? AND user_id=?",
      [task_id, req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Task not found or not yours" });
    }

    const {
      category,
      component,
      mechanicProblem,
      description,
      location,
      urgency,
      reward_amount
    } = req.body;

    const title =
      (category || "Service") +
      " - " +
      (mechanicProblem || component || "General Help");

    const reward = reward_amount ? Number(reward_amount) : 0;

    await pool.query(
      `UPDATE tasks 
       SET title=?, description=?, location=?, urgency=?, reward_amount=?
       WHERE task_id=?`,
      [title, description, location, urgency, reward, task_id]
    );

    return res.json({ message: "Task updated" });
  } catch (err) {
    console.error("Error while updating task:", err);
    return res.status(500).json({ message: "Task update failed" });
  }
});

    // ------------------ CUSTOMER: DELETE TASK ------------------
app.delete('/api/tasks/:task_id', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const task_id = req.params.task_id;

    // Check ownership
    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE task_id=? AND user_id=?",
      [task_id, req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Task not found or not yours" });
    }

    await pool.query("DELETE FROM tasks WHERE task_id=?", [task_id]);

    return res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("Error while deleting task:", err);
    return res.status(500).json({ message: "Task delete failed" });
  }
});


    
    
   
   


// ------------------ CUSTOMER: VIEW OWN TASKS ------------------
app.get('/api/my-tasks', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE user_id=?", 
      [req.user.user_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to load tasks" });
  }
});

// ------------------ CUSTOMER: VIEW COMPLETED TASKS ------------------
app.get('/api/my-completed-tasks', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE user_id=? AND status = 'completed' ORDER BY created_at DESC",
      [req.user.user_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("My-completed-tasks error:", err);
    res.status(500).json({ message: "Failed to load completed tasks" });
  }
});



// ------------------ HELPER: VIEW OPEN TASKS ------------------
app.get('/api/open-tasks', authMiddleware, requireRole("helper"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM tasks WHERE status='open'");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to load open tasks" });
  }
});

// ------------------ HELPER: VIEW SINGLE OPEN TASK ------------------
app.get("/api/helper/tasks/:task_id", authMiddleware, requireRole("helper"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM tasks WHERE task_id=?",
      [req.params.task_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load task" });
  }
});


// ------------------ HELPER: ACCEPT TASK ------------------
app.post('/api/tasks/:task_id/accept', authMiddleware, requireRole("helper"), async (req, res) => {
  try {
    const task_id = req.params.task_id;

    const [check] = await pool.query("SELECT * FROM tasks WHERE task_id=?", [task_id]);
    if (check.length === 0) return res.status(400).json({ message: "Task not found" });

    if (check[0].status !== 'open')
      return res.status(400).json({ message: "Task already taken" });

    await pool.query(
      "INSERT INTO task_assignments (task_id, helper_id) VALUES (?, ?)",
      [task_id, req.user.user_id]
    );

    await pool.query("UPDATE tasks SET status='assigned' WHERE task_id=?", [task_id]);

    res.json({ message: "Task accepted" });

  } catch (err) {
    res.status(500).json({ message: "Failed to accept task" });
  }
});

// ------------------ HELPER: VIEW ASSIGNED TASKS ------------------
app.get('/api/my-assigned-tasks', authMiddleware, requireRole("helper"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tasks.* 
       FROM tasks 
       JOIN task_assignments 
       ON tasks.task_id = task_assignments.task_id 
       WHERE task_assignments.helper_id=?`,
      [req.user.user_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to load assigned tasks" });
  }
});

// ------------------ HELPER: COMPLETE TASK ------------------
app.post(
  "/api/tasks/:task_id/complete",
  authMiddleware,
  requireRole("helper"),
  async (req, res) => {
    try {
      const task_id = req.params.task_id;

      // Verify task is assigned to this helper
      const [rows] = await pool.query(
        `SELECT * FROM task_assignments 
         WHERE task_id=? AND helper_id=?`,
        [task_id, req.user.user_id]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          message: "You are not assigned to this task"
        });
      }

      // Update task status
      await pool.query(
        "UPDATE tasks SET status='completed' WHERE task_id=?",
        [task_id]
      );

      res.json({ message: "✅ Task marked as completed" });

    } catch (err) {
      console.error("Complete task error:", err);
      res.status(500).json({ message: "Failed to complete task" });
    }
  }
);



app.post('/api/tasks/:task_id/review', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const task_id = req.params.task_id;

    const [[task]] = await pool.query(
      `SELECT t.*, ta.helper_id
       FROM tasks t
       JOIN task_assignments ta ON t.task_id = ta.task_id
       WHERE t.task_id=? AND t.user_id=? AND t.status='completed'`,
      [task_id, req.user.user_id]
    );

    if (!task)
      return res.status(400).json({ message: "Task not eligible for review" });

    await pool.query(
      `INSERT INTO reviews (task_id, helper_id, customer_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [task_id, task.helper_id, req.user.user_id, rating, comment]
    );

    res.json({ message: "Review submitted successfully" });

  } catch (err) {
    res.status(500).json({ message: "Review failed" });
  }
});

// ------------------ CUSTOMER: GET NOTIFICATIONS ------------------
app.get(
  "/api/notifications",
  authMiddleware,
  requireRole("customer"),
  async (req, res) => {
    const [rows] = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id=? 
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );

    res.json(rows);
  }
);

// ------------------ MARK NOTIFICATION READ ------------------
app.put(
  "/api/notifications/:id/read",
  authMiddleware,
  requireRole("customer"),
  async (req, res) => {
    await pool.query(
      "UPDATE notifications SET is_read=1 WHERE notification_id=?",
      [req.params.id]
    );
    res.json({ message: "Marked read" });
  }
);

// =======================================================
// CHAT ROUTES (CUSTOMER + HELPER)
// =======================================================

// 👉 1) Start / Get chat for a task
app.post("/api/chats/start", authMiddleware, async (req, res) => {
  try {
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ message: "task_id required" });
    }

    let customer_id, helper_id;

    if (req.user.role === "helper") {
      // helper side: verify this helper is assigned for this task
      const [[row]] = await pool.query(
        `SELECT t.user_id AS customer_id, ta.helper_id
         FROM tasks t
         JOIN task_assignments ta ON t.task_id = ta.task_id
         WHERE t.task_id = ? AND ta.helper_id = ?`,
        [task_id, req.user.user_id]
      );

      if (!row) {
        return res.status(403).json({
          message: "You are not assigned to this task",
        });
      }

      customer_id = row.customer_id;
      helper_id = row.helper_id;
    } else if (req.user.role === "customer") {
      // customer side: verify this is his/her task and has helper
      const [[row]] = await pool.query(
        `SELECT t.user_id AS customer_id, ta.helper_id
         FROM tasks t
         JOIN task_assignments ta ON t.task_id = ta.task_id
         WHERE t.task_id = ? AND t.user_id = ?`,
        [task_id, req.user.user_id]
      );

      if (!row) {
        return res.status(403).json({
          message: "No helper assigned or not your task",
        });
      }

      customer_id = row.customer_id;
      helper_id = row.helper_id;
    } else {
      return res.status(403).json({ message: "Invalid role for chat" });
    }

    // Check if chat already exists
    const [existing] = await pool.query(
      `SELECT * FROM chats 
       WHERE task_id=? AND customer_id=? AND helper_id=?`,
      [task_id, customer_id, helper_id]
    );

    if (existing.length > 0) {
      return res.json(existing[0]); // return existing chat
    }

    // Create new chat
    const [result] = await pool.query(
      `INSERT INTO chats (task_id, customer_id, helper_id)
       VALUES (?, ?, ?)`,
      [task_id, customer_id, helper_id]
    );

    const chat = {
      chat_id: result.insertId,
      task_id,
      customer_id,
      helper_id,
    };

    return res.json(chat);
  } catch (err) {
    console.error("Chat start error:", err);
    return res.status(500).json({ message: "Failed to start chat" });
  }
});

// 👉 2) Get all chats for logged in user
app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.query(
      `SELECT c.*, t.title
       FROM chats c
       JOIN tasks t ON c.task_id = t.task_id
       WHERE c.customer_id = ? OR c.helper_id = ?
       ORDER BY c.created_at DESC`,
      [userId, userId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Get chats error:", err);
    res.status(500).json({ message: "Failed to load chats" });
  }
});

// 👉 3) Get messages of one chat
app.get("/api/chats/:chat_id/messages", authMiddleware, async (req, res) => {
  try {
    const { chat_id } = req.params;
    const userId = req.user.user_id;

    // Check membership
    const [[chat]] = await pool.query(
      `SELECT * FROM chats 
       WHERE chat_id = ? AND (customer_id = ? OR helper_id = ?)`,
      [chat_id, userId, userId]
    );

    if (!chat) {
      return res.status(403).json({ message: "Access denied to this chat" });
    }

    const [messages] = await pool.query(
      `SELECT m.*, u.full_name 
       FROM chat_messages m
       JOIN users u ON m.sender_id = u.user_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at ASC`,
      [chat_id]
    );

    res.json(messages);
  } catch (err) {
    console.error("Get chat messages error:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

// 👉 4) Send message in a chat
app.post("/api/chats/:chat_id/messages", authMiddleware, async (req, res) => {
  try {
    const { chat_id } = req.params;
    const { message } = req.body;
    const userId = req.user.user_id;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    // Check membership
    const [[chat]] = await pool.query(
      `SELECT * FROM chats 
       WHERE chat_id = ? AND (customer_id = ? OR helper_id = ?)`,
      [chat_id, userId, userId]
    );

    if (!chat) {
      return res.status(403).json({ message: "Access denied to this chat" });
    }

    // Insert message
    const [result] =await pool.query(
  `INSERT INTO chat_messages (chat_id, sender_id, sender_role, message)
   VALUES (?, ?, ?, ?)`,
  [chat_id, userId, req.user.role, message.trim()]
);


    // Optional: notification for other user
    const otherUserId =
      chat.customer_id === userId ? chat.helper_id : chat.customer_id;

    await createNotification({
      user_id: otherUserId,
      task_id: chat.task_id,
      type: "chat_message",
      title: "New chat message 💬",
      message: message.slice(0, 100),
    });

    res.json({
      message: "Message sent",
      message_id: result.insertId,
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});




// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

