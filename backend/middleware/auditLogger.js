const { execute } = require('../db/mysql');

/**
 * Middleware factory that logs admin actions.
 * Usage: router.post('/products', requireAuth, requireAdmin, auditLogger('CREATE', 'Product'), handler)
 */
const auditLogger = (action, targetModel) => async (req, res, next) => {
  // Wrap res.json to capture the response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      execute(
        `INSERT INTO audit_logs (actor_id, actor_email, action, target_model, target_id, before_json, after_json, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id || Number(req.user._id),
          req.user.email,
          action,
          targetModel,
          body?._id || req.params?.id || null,
          req._auditBefore ? JSON.stringify(req._auditBefore) : null,
          body ? JSON.stringify(body) : null,
          req.ip,
        ]
      ).catch(() => {});
    }
    return originalJson(body);
  };
  next();
};

module.exports = auditLogger;
