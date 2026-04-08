const bcrypt = require('bcryptjs');

const db = require('@/services/dbService');
const { mapAdmin } = require('@/services/mysql/common');

const activeSessionsByUser = new Map();
const passwordResetTokensByUser = new Map();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getSessionSet = (userId) => {
  const key = Number(userId);
  if (!activeSessionsByUser.has(key)) {
    activeSessionsByUser.set(key, new Set());
  }
  return activeSessionsByUser.get(key);
};

const getExistingSessionSet = (userId) => activeSessionsByUser.get(Number(userId)) || null;

const findAdminById = async (id) => {
  const rows = await db.query(
    'SELECT id, name, email, password, role, created FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return mapAdmin(rows[0]);
};

const findAdminByEmail = async (email) => {
  const rows = await db.query(
    'SELECT id, name, email, password, role, created FROM users WHERE LOWER(email) = ? LIMIT 1',
    [normalizeEmail(email)]
  );
  return mapAdmin(rows[0]);
};

const getPasswordRecordByUserId = async (userId) => {
  const user = await findAdminById(userId);
  if (!user) return null;

  return {
    admin_id: user.id,
    password: user.password,
    logged_sessions: JSON.stringify([...getSessionSet(user.id)]),
    reset_token: passwordResetTokensByUser.get(user.id) || null,
  };
};

const appendLoggedSession = async (userId, token) => {
  getSessionSet(userId).add(token);
  return getPasswordRecordByUserId(userId);
};

const removeLoggedSession = async (userId, token) => {
  getSessionSet(userId).delete(token);
  return getPasswordRecordByUserId(userId);
};

const isLoggedSessionActive = (userId, token) => {
  const sessions = getExistingSessionSet(userId);
  if (!sessions || sessions.size === 0) {
    return true;
  }
  return sessions.has(token);
};

const setPasswordResetToken = async (userId, token) => {
  passwordResetTokensByUser.set(Number(userId), token);
  return token;
};

const getPasswordResetToken = async (userId) => passwordResetTokensByUser.get(Number(userId)) || null;

const clearPasswordResetToken = async (userId) => {
  passwordResetTokensByUser.delete(Number(userId));
  return true;
};

const listStaff = async ({ page = 1, limit = 10 } = {}) => {
  const offset = (page - 1) * limit;
  const items = await db.query(
    `SELECT id, name, email, password, role, created
     FROM users
     WHERE role = 'staff'
     ORDER BY created DESC, id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const countRows = await db.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'staff'`);

  return {
    items: items.map(mapAdmin),
    count: Number(countRows[0]?.count || 0),
  };
};

const listAllStaff = async () => {
  const rows = await db.query(
    `SELECT id, name, email
     FROM users
     WHERE role = 'staff'
     ORDER BY name ASC`
  );

  return rows.map((row) => ({
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: '',
  }));
};

const createStaff = async ({ name, email, password, role = 'staff' }) =>
  db.transaction(async (tx) => {
    const existing = await tx.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [
      normalizeEmail(email),
    ]);

    if (existing.length > 0) {
      const error = new Error('Email already exists');
      error.status = 400;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await tx.run(
      `INSERT INTO users
       (name, email, password, role, created)
       VALUES (?, ?, ?, ?, NOW())`,
      [name, normalizeEmail(email), hashedPassword, role]
    );

    const staff = await tx.query(
      'SELECT id, name, email, password, role, created FROM users WHERE id = ? LIMIT 1',
      [userResult.insertId]
    );
    return mapAdmin(staff[0]);
  });

const updateStaff = async (id, { name, email, password }) =>
  db.transaction(async (tx) => {
    const rows = await tx.query(
      'SELECT id, name, email, password, role, created FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const staff = rows[0];

    if (!staff) {
      const error = new Error('Staff not found');
      error.status = 404;
      throw error;
    }

    const duplicate = await tx.query(
      'SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1',
      [normalizeEmail(email), id]
    );

    if (duplicate.length > 0) {
      const error = new Error('Email already exists');
      error.status = 400;
      throw error;
    }

    const nextPassword = password ? await bcrypt.hash(password, 10) : staff.password;

    await tx.run(
      `UPDATE users
       SET name = ?, email = ?, password = ?
       WHERE id = ?`,
      [name, normalizeEmail(email), nextPassword, id]
    );

    const updated = await tx.query(
      'SELECT id, name, email, password, role, created FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return mapAdmin(updated[0]);
  });

const softDeleteStaff = async (id) => {
  const existing = await findAdminById(id);
  if (!existing) return null;

  await db.run("DELETE FROM users WHERE id = ? AND role = 'staff'", [id]);
  activeSessionsByUser.delete(Number(id));
  passwordResetTokensByUser.delete(Number(id));
  return existing;
};

const updateProfile = async (id, updates = {}) => {
  const existing = await findAdminById(id);
  if (!existing) return null;

  await db.run('UPDATE users SET email = ?, name = ? WHERE id = ?', [
    normalizeEmail(updates.email || existing.email),
    updates.name || existing.name,
    id,
  ]);

  return findAdminById(id);
};

const updatePassword = async (id, password) => {
  const passwordHash = await bcrypt.hash(password, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, id]);
  return true;
};

module.exports = {
  findAdminById,
  findAdminByEmail,
  getPasswordRecordByUserId,
  appendLoggedSession,
  removeLoggedSession,
  isLoggedSessionActive,
  setPasswordResetToken,
  getPasswordResetToken,
  clearPasswordResetToken,
  listStaff,
  listAllStaff,
  createStaff,
  updateStaff,
  softDeleteStaff,
  updateProfile,
  updatePassword,
};
