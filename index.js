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
app.post('/api/tasks', authMiddleware, requireRole("customer"), async (req, res) => {
  try {
    const { title, description, location, reward_amount, urgency } = req.body;

    const [result] = await pool.query(
      "INSERT INTO tasks (user_id, title, description, location, reward_amount, urgency) VALUES (?, ?, ?, ?, ?, ?)",
      [req.user.user_id, title, description, location, reward_amount, urgency]
    );

    res.json({ message: "Task created", task_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: "Task create failed" });
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

// ------------------ HELPER: VIEW OPEN TASKS ------------------
app.get('/api/open-tasks', authMiddleware, requireRole("helper"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM tasks WHERE status='open'");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to load open tasks" });
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

// ------------------ START SERVER ------------------
app.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});
