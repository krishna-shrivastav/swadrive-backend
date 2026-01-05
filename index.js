// ================== ENV LOAD ==================
require("dotenv").config();

// ================== IMPORTS ==================
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const pool = require("./db");

// ================== APP INIT ==================
const app = express();
// ================== MIDDLEWARE ==================
app.use(cors({
  origin: [
    "http://localhost:4000",
    "http://127.0.0.1:5500",
    "https://krishna-shrivastav.github.io"
  ],
  credentials: true
}));

app.use(bodyParser.json());

// ================== JWT ==================
function createToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ================== AUTH ==================
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
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

// ================== ROOT ==================
app.get("/", (_, res) => {
  res.send("✅ SwaDrive Backend is running");
});

// ================== REGISTER ==================
app.post("/api/register", async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;

    const check = await pool.query(
      "SELECT 1 FROM users WHERE email=$1",
      [email]
    );
    if (check.rowCount > 0)
      return res.status(400).json({ message: "Email exists" });

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name,email,phone,password_hash,role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING user_id, role`,
      [full_name, email, phone, hash, role || "customer"]
    );

    const token = createToken(result.rows[0]);
    res.json({ token, user_id: result.rows[0].user_id });
  } catch (e) {
    res.status(500).json({ message: "Register failed" });
  }
});

// ================== LOGIN ==================
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );
    if (result.rowCount === 0)
      return res.status(400).json({ message: "User not found" });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: "Wrong password" });

    const token = createToken(user);
    res.json({ token, user });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

// ================== CREATE TASK ==================
app.post("/api/tasks", authMiddleware, requireRole("customer"), async (req, res) => {
  const { description, location, urgency, reward_amount } = req.body;

  const result = await pool.query(
    `INSERT INTO tasks (user_id,title,description,location,urgency,reward_amount)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING task_id`,
    [
      req.user.user_id,
      "Service Request",
      description,
      location,
      urgency,
      reward_amount || 0
    ]
  );

  res.json({ task_id: result.rows[0].task_id });
});

// ================== OPEN TASKS ==================
app.get("/api/open-tasks", authMiddleware, requireRole("helper"), async (_, res) => {
  const result = await pool.query(
    "SELECT * FROM tasks WHERE status='open'"
  );
  res.json(result.rows);
});

// ================== ACCEPT TASK ==================
app.post("/api/tasks/:id/accept", authMiddleware, requireRole("helper"), async (req, res) => {
  const task_id = req.params.id;

  await pool.query(
    "INSERT INTO task_assignments (task_id, helper_id) VALUES ($1,$2)",
    [task_id, req.user.user_id]
  );

  await pool.query(
    "UPDATE tasks SET status='assigned' WHERE task_id=$1",
    [task_id]
  );

  res.json({ message: "Task accepted" });
});

// ================== COMPLETE TASK ==================
app.post("/api/tasks/:id/complete", authMiddleware, requireRole("helper"), async (req, res) => {
  await pool.query(
    "UPDATE tasks SET status='completed' WHERE task_id=$1",
    [req.params.id]
  );
  res.json({ message: "Task completed" });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
