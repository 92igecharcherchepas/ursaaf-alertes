const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'sanctions.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sanctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    moderator_id TEXT,
    moderator_tag TEXT,
    type TEXT NOT NULL,          -- ban | kick | timeout | timeout_remove
    reason TEXT,
    duration_ms INTEGER,         -- durée du mute en ms (null si non applicable)
    source_bot TEXT,             -- nom du bot/appli qui a exécuté l'action si identifiable
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions(guild_id, user_id);

  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,       -- serveur surveillé
    log_channel_id TEXT,             -- salon (potentiellement sur un AUTRE serveur) où poster les logs
    log_guild_id TEXT,               -- id du serveur où se trouve ce salon (info, pour affichage)
    updated_by TEXT,
    updated_at INTEGER
  );
`);

function addSanction({
  guildId,
  userId,
  userTag,
  moderatorId,
  moderatorTag,
  type,
  reason,
  durationMs = null,
  sourceBot = null,
}) {
  const stmt = db.prepare(`
    INSERT INTO sanctions
      (guild_id, user_id, user_tag, moderator_id, moderator_tag, type, reason, duration_ms, source_bot, created_at)
    VALUES (@guildId, @userId, @userTag, @moderatorId, @moderatorTag, @type, @reason, @durationMs, @sourceBot, @createdAt)
  `);
  return stmt.run({
    guildId,
    userId,
    userTag,
    moderatorId,
    moderatorTag,
    type,
    reason: reason || 'Aucune raison fournie',
    durationMs,
    sourceBot,
    createdAt: Date.now(),
  });
}

function getSanctionsForUser(guildId, userId, limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM sanctions
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(guildId, userId, limit);
}

function countSanctionsForUser(guildId, userId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as c FROM sanctions WHERE guild_id = ? AND user_id = ?
  `);
  return stmt.get(guildId, userId).c;
}

function setLogChannel({ guildId, logChannelId, logGuildId, updatedBy }) {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, log_channel_id, log_guild_id, updated_by, updated_at)
    VALUES (@guildId, @logChannelId, @logGuildId, @updatedBy, @updatedAt)
    ON CONFLICT(guild_id) DO UPDATE SET
      log_channel_id = excluded.log_channel_id,
      log_guild_id = excluded.log_guild_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `);
  return stmt.run({ guildId, logChannelId, logGuildId, updatedBy, updatedAt: Date.now() });
}

function getLogConfig(guildId) {
  const stmt = db.prepare(`SELECT * FROM guild_config WHERE guild_id = ?`);
  return stmt.get(guildId) || null;
}

function clearLogChannel(guildId) {
  const stmt = db.prepare(`DELETE FROM guild_config WHERE guild_id = ?`);
  return stmt.run(guildId);
}

module.exports = {
  db,
  addSanction,
  getSanctionsForUser,
  countSanctionsForUser,
  setLogChannel,
  getLogConfig,
  clearLogChannel,
};