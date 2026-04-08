const { pool, getConnection } = require('@/db/db');

const query = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};

const run = async (sql, params = []) => {
  const [result] = await pool.execute(sql, params);
  return result;
};

const transaction = async (handler) => {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const tx = {
      query: async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      },
      run: async (sql, params = []) => {
        const [result] = await connection.execute(sql, params);
        return result;
      },
      raw: connection,
    };

    const result = await handler(tx);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  query,
  run,
  transaction,
};
