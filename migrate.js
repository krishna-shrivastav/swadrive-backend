const pool = require('./db');  

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
        role ENUM('customer', 'helper') DEFAULT 'customer',
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
              urgency ENUM('emergency',
        'immediate',
        'today',
        'tomorrow',
        'week',
        'flexible') DEFAULT 'today',
        status ENUM('open','assigned','completed') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);
    // ✅ FORCE UPDATE TASKS TABLE (FOR EXISTING DB)
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

    // TASK ASSIGNMENTS TABLE
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

      // NOTIFICATIONS table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      task_id INT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_notifications_task
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
        ON DELETE SET NULL
    )
  `);
await pool.query(`
      CREATE TABLE reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  helper_id INT NOT NULL,
  customer_id INT NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (helper_id) REFERENCES users(user_id),
  FOREIGN KEY (customer_id) REFERENCES users(user_id)
  )
');



    console.log("✅ All tables created successfully!");
    

  } catch (err) {
    console.error("❌ Migration failed:", err);
    
  }
}

createTables();










