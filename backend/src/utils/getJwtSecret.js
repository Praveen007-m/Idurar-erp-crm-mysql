const FALLBACK_JWT_SECRET = 'idurar-mysql-migration-dev-secret';

module.exports = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  console.warn('[auth] JWT_SECRET is not set. Falling back to a development secret.');
  return FALLBACK_JWT_SECRET;
};
