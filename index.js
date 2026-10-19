require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
} = require('discord.js');
const { addSanction, getLogConfig } = require('./src/database');
const { buildGrayContainer } = require('./src/components');
const sanctionsCommand = require('./src/commands/sanctions');
const panelCommand = require('./src/commands/panel');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.User, Partials.GuildMember],
});

client.commands = new Map();
client.commands.set(sanctionsCommand.data.name, sanctionsCommand);
client.commands.set(panelCommand.data.name, panelCommand);

client.once(Events.ClientReady, (c) => {
  console.log(` Connecté en tant que ${c.user.tag}`);
});

// ---------- Slash commands ----------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(' Une erreur est survenue.');
    } else {
      await interaction.reply({ content: ' Une erreur est survenue.', ephemeral: true });
    }
  }
});

// ---------- Détection centralisée via Audit Log ----------
// Se déclenche pour CHAQUE ban/kick/timeout posé sur le serveur, peu importe
// le bot (ou l'humain) qui l'a exécuté : c'est Discord lui-même qui log l'action.
client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  try {
    switch (entry.action) {
      case AuditLogEvent.MemberBanAdd:
        await handleSanction(guild, entry, 'ban');
        break;
      case AuditLogEvent.MemberKick:
        await handleSanction(guild, entry, 'kick');
        break;
      case AuditLogEvent.MemberUpdate:
        await handleTimeoutChange(guild, entry);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Erreur audit log:', err);
  }
});

async function handleSanction(guild, entry, type) {
  const target = entry.target; // user visé
  const executor = entry.executor; // qui/quel bot a exécuté

  addSanction({
    guildId: guild.id,
    userId: target.id,
    userTag: target.tag ?? target.username,
    moderatorId: executor?.id ?? null,
    moderatorTag: executor?.tag ?? 'Inconnu',
    type,
    reason: entry.reason,
    sourceBot: executor?.bot ? executor.tag : null,
  });

  await postLog(guild, {
    title: type === 'ban' ? ' Bannissement enregistré' : ' Expulsion enregistrée',
    lines: [
      `**Membre :** <@${target.id}> (${target.id})`,
      `**Modérateur / bot :** ${executor ? `<@${executor.id}> (${executor.tag})` : 'Inconnu'}`,
      `**Raison :** ${entry.reason ?? 'Aucune raison fournie'}`,
    ],
    footer: 'Ursaaf • Log centralisé',
  });
}

async function handleTimeoutChange(guild, entry) {
  // On ne s'intéresse qu'aux changements de communication_disabled_until (= mute/timeout)
  const change = entry.changes?.find((c) => c.key === 'communication_disabled_until');
  if (!change) return;

  const target = entry.target;
  const executor = entry.executor;
  const newValue = change.new; // date ISO ou undefined si retiré
  const oldValue = change.old;

  const isRemoval = !newValue && oldValue;
  const type = isRemoval ? 'timeout_remove' : 'timeout';

  let durationMs = null;
  if (!isRemoval && newValue) {
    durationMs = new Date(newValue).getTime() - Date.now();
    if (durationMs < 0) durationMs = null;
  }

  addSanction({
    guildId: guild.id,
    userId: target.id,
    userTag: target.tag ?? target.username,
    moderatorId: executor?.id ?? null,
    moderatorTag: executor?.tag ?? 'Inconnu',
    type,
    reason: entry.reason,
    durationMs,
    sourceBot: executor?.bot ? executor.tag : null,
  });

  await postLog(guild, {
    title: isRemoval ? ' Mute retiré' : ' Mute enregistré',
    lines: [
      `**Membre :** <@${target.id}> (${target.id})`,
      `**Modérateur / bot :** ${executor ? `<@${executor.id}> (${executor.tag})` : 'Inconnu'}`,
      !isRemoval && durationMs
        ? `**Durée :** ${formatDuration(durationMs)}`
        : null,
      `**Raison :** ${entry.reason ?? 'Aucune raison fournie'}`,
    ].filter(Boolean),
    footer: 'Ursaaf',
  });

  // DM à la personne mute (uniquement quand c'est un nouveau mute, pas un retrait)
  if (!isRemoval) {
    await dmMutedUser(guild, target, {
      moderator: executor,
      reason: entry.reason,
      durationMs,
    });
  }
}

async function dmMutedUser(guild, target, { moderator, reason, durationMs }) {
  try {
    const user = await client.users.fetch(target.id);
    const payload = buildGrayContainer({
      title: ` Vous avez été mute sur ${guild.name}`,
      lines: [
        `**Durée :** ${durationMs ? formatDuration(durationMs) : 'Non déterminée'}`,
        `**Raison :** ${reason ?? 'Aucune raison fournie'}`,
        moderator ? `**Sanctionné par :** ${moderator.tag}` : null,
      ].filter(Boolean),
      footer: 'Ursaaf',
    });
    await user.send(payload);
  } catch (err) {
    console.warn(`Impossible d'envoyer un DM à ${target.id} (DMs fermés probablement).`);
  }
}

async function postLog(guild, { title, lines, footer }) {
  // On va chercher le salon configuré via /panel pour CE serveur surveillé.
  // Ce salon peut être sur un serveur différent (le "serveur de logs") tant
  // qu'Ursaaf y est aussi présent : client.channels.fetch marche cross-serveur.
  const config = getLogConfig(guild.id);
  if (!config || !config.log_channel_id) return; // pas configuré -> pas de log posté

  const channel = await client.channels.fetch(config.log_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const payload = buildGrayContainer({
    title,
    lines: [`**Serveur source :** ${guild.name} (${guild.id})`, ...lines],
    footer,
  });
  await channel.send(payload).catch(() => null);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !days) parts.push(`${minutes}min`);
  return parts.length ? parts.join(' ') : '< 1min';
}

client.login(process.env.DISCORD_TOKEN);