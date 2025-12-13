const pool = require("./db");

async function createTables() {
  try {
    // USERS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(20),
        password_hash TEXT,
        role ENUM('customer','helper') DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // TASKS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        title VARCHAR(255),
        description TEXT,
        location VARCHAR(255),
        reward_amount DECIMAL(10,2),
        urgency ENUM(
          'emergency',
          'immediate',
          'today',
          'tomorrow',
          'week',
          'flexible'
        ) DEFAULT 'today',
        status ENUM('open','assigned','completed') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // FORCE UPDATE URGENCY ENUM
    await pool.query(`
      ALTER TABLE tasks 
      MODIFY COLUMN urgency ENUM(
        'emergency',
        'immediate',
        'today',
        'tomorrow',
        'week',
        'flexible'
      ) DEFAULT 'today'
    `);

    // TASK ASSIGNMENTS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT,
        helper_id INT,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id),
        FOREIGN KEY (helper_id) REFERENCES users(user_id)
      )
    `);

    // NOTIFICATIONS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        task_id INT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
      )
    `);

    // REVIEWS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        review_id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        helper_id INT NOT NULL,
        customer_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id),
        FOREIGN KEY (helper_id) REFERENCES users(user_id),
        FOREIGN KEY (customer_id) REFERENCES users(user_id)
      )
    `);

    await pool.query(`
   CREATE TABLE IF NOT EXISTS chats (
  chat_id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
)
`);

    // ✅ ADD customer_id & helper_id TO chats TABLE (SAFE)
const [chatColumns] = await pool.query(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'chats'
`);

const hasCustomerId = chatColumns.some(c => c.COLUMN_NAME === 'customer_id');
const hasHelperId = chatColumns.some(c => c.COLUMN_NAME === 'helper_id');

if (!hasCustomerId) {
  await pool.query(`
    ALTER TABLE chats 
    ADD COLUMN customer_id INT NOT NULL
  `);
}

if (!hasHelperId) {
  await pool.query(`
    ALTER TABLE chats 
    ADD COLUMN helper_id INT NOT NULL
  `);
}

    // ✅ ADD FOREIGN KEYS SAFELY
await pool.query(`
  ALTER TABLE chats
  ADD CONSTRAINT fk_chats_customer
  FOREIGN KEY (customer_id) REFERENCES users(user_id)
  ON DELETE CASCADE
`).catch(() => {});

await pool.query(`
  ALTER TABLE chats
  ADD CONSTRAINT fk_chats_helper
  FOREIGN KEY (helper_id) REFERENCES users(user_id)
  ON DELETE CASCADE
`).catch(() => {});


    await pool.query(`
   CREATE TABLE IF NOT EXISTS chat_messages  (
  message_id INT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_role ENUM('customer','helper') NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
  FOREIGN KEY (sender_id) REFERENCES users(user_id)
)
`);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS message (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    receiver_id INT,
    message TEXT,
    delivered TINYINT DEFAULT 0,
    seen TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT,
    sender_id INT,
    sender_role ENUM('customer','helper'),
    message TEXT,
    delivered TINYINT DEFAULT 0,
    seen TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
  )
`);




    console.log("✅ All tables created successfully!");

  } catch (err) {
    console.error("❌ Migration failed:", err);
  }
}

createTables();









