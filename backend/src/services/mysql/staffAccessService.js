const db = require('@/services/dbService');

const getStaffClientIds = async (admin) => {
  if (!admin || admin.role !== 'staff') {
    return null;
  }

  const rows = await db.query(
    `SELECT id
     FROM clients
     WHERE assigned = ? AND removed = 0`,
    [admin._id || admin.id]
  );

  return rows.map((row) => row.id);
};

const buildStaffFilter = async (admin, clientFieldName = 'client_id') => {
  if (!admin || ['admin', 'owner', 'superadmin'].includes(admin.role)) {
    return { clause: '', params: [] };
  }

  const clientIds = await getStaffClientIds(admin);

  if (!clientIds || clientIds.length === 0) {
    return { clause: ' AND 1 = 0 ', params: [] };
  }

  const placeholders = clientIds.map(() => '?').join(', ');
  return {
    clause: ` AND ${clientFieldName} IN (${placeholders}) `,
    params: clientIds,
  };
};

const hasAccessToClient = async (admin, clientId) => {
  if (!admin || admin.role !== 'staff') {
    return true;
  }

  const rows = await db.query(
    'SELECT id FROM clients WHERE id = ? AND assigned = ? AND removed = 0 LIMIT 1',
    [clientId, admin._id || admin.id]
  );

  return rows.length > 0;
};

module.exports = {
  getStaffClientIds,
  buildStaffFilter,
  hasAccessToClient,
};
