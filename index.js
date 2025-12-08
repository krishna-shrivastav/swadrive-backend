// ------------------ AUTO CREATE TABLES ------------------
require("./migrate");

// ------------------ IMPORTS ------------------
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();

// ------------------ MIDDLEWARE ------------------
app.use(cors({
  origin: [
    "http://localhost:4000",
    "http://127.0.0.1:5500",
    "https://krishna-shrivastav.github.io"
  ],
  credentials: true
}));

app.use(bodyParser.json());

// ------------------ JWT ------------------
function createToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ------------------ AUTH ------------------
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ message: "No token" });

  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ message: "Access denied" });
    next();
  };
}

// ------------------ NOTIFICATION HELPER ------------------
async function createNotification({ user_id, task_id, type, title, message }) {
  await pool.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, task_id || null, type, title, message]
  );
}

// ------------------ BASIC ------------------
app.get("/", (req, res) => {
  res.send("✅ SwaDrive Backend Running");
});

// =======================================================
// AUTH
// =======================================================
app.post("/api/register", async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const [r] = await pool.query(
      `INSERT INTO users (full_name,email,phone,password_hash,role)
       VALUES (?,?,?,?,?)`,
      [full_name, email, phone, hashed, role || "customer"]
    );

    res.json({ token: createToken({ user_id: r.insertId, role }) });
  } catch {
    res.status(500).json({ message: "Register failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const [[u]] = await pool.query(
    "SELECT * FROM users WHERE email=?", [email]
  );

  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(400).json({ message: "Invalid credentials" });

  res.json({ token: createToken(u) });
});

// =======================================================
// CUSTOMER
// =======================================================
app.post("/api/tasks", authMiddleware, requireRole("customer"), async (req, res) => {
  const { description, location, urgency, reward_amount } = req.body;

  const [r] = await pool.query(
    `INSERT INTO tasks (user_id,title,description,location,urgency,reward_amount)
     VALUES (?, 'Help Needed', ?, ?, ?, ?)`,
    [req.user.user_id, description, location, urgency, reward_amount || 0]
  );

  res.json({ task_id: r.insertId });
});

app.get("/api/my-tasks", authMiddleware, requireRole("customer"), async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM tasks WHERE user_id=?", [req.user.user_id]
  );
  res.json(rows);
});

// =======================================================
// HELPER
// =======================================================
app.get("/api/open-tasks", authMiddleware, requireRole("helper"), async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM tasks WHERE status='open'"
  );
  res.json(rows);
});

app.post("/api/tasks/:task_id/accept", authMiddleware, requireRole("helper"), async (req, res) => {
  const { task_id } = req.params;

  const [[task]] = await pool.query(
    "SELECT * FROM tasks WHERE task_id=? AND status='open'", [task_id]
  );
  if (!task) return res.status(400).json({ message: "Not available" });

  await pool.query(
    "INSERT INTO task_assignments (task_id, helper_id) VALUES (?,?)",
    [task_id, req.user.user_id]
  );
  await pool.query(
    "UPDATE tasks SET status='assigned' WHERE task_id=?", [task_id]
  );

  await createNotification({
    user_id: task.user_id,
    task_id,
    type: "accepted",
    title: "Task accepted ✅",
    message: "A helper accepted your task"
  });

  res.json({ message: "Accepted" });
});

app.post("/api/tasks/:task_id/complete", authMiddleware, requireRole("helper"), async (req, res) => {
  const { task_id } = req.params;

  const [[task]] = await pool.query(
    `SELECT t.*, ta.helper_id 
     FROM tasks t JOIN task_assignments ta 
     ON t.task_id=ta.task_id
     WHERE t.task_id=? AND ta.helper_id=?`,
    [task_id, req.user.user_id]
  );

  if (!task) return res.status(403).json({ message: "Not your task" });

  await pool.query(
    "UPDATE tasks SET status='completed' WHERE task_id=?", [task_id]
  );

  await createNotification({
    user_id: task.user_id,
    task_id,
    type: "completed",
    title: "Task completed 🎉",
    message: "Please review your helper"
  });

  res.json({ message: "Completed" });
});

// =======================================================
// REVIEW
// =======================================================
app.post("/api/tasks/:task_id/review", authMiddleware, requireRole("customer"), async (req, res) => {
  const { rating, comment } = req.body;
  const { task_id } = req.params;

  const [[task]] = await pool.query(
    `SELECT ta.helper_id FROM tasks t
     JOIN task_assignments ta ON t.task_id=ta.task_id
     WHERE t.task_id=? AND t.user_id=? AND t.status='completed'`,
    [task_id, req.user.user_id]
  );

  if (!task) return res.status(400).json({ message: "Invalid review" });

  await pool.query(
    `INSERT INTO reviews (task_id,helper_id,customer_id,rating,comment)
     VALUES (?,?,?,?,?)`,
    [task_id, task.helper_id, req.user.user_id, rating, comment]
  );

  res.json({ message: "Review submitted" });
});

// ------------------ SERVER ------------------
app.listen(process.env.PORT || 10000, () =>
  console.log("✅ Server running")
);
