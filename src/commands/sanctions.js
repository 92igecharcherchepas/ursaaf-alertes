const { SlashCommandBuilder } = require('discord.js');
const { getSanctionsForUser, countSanctionsForUser } = require('../database');
const { buildGrayContainer } = require('../components');

const TYPE_LABELS = {
  ban: ' Ban',
  kick: ' Kick',
  timeout: ' Mute',
  timeout_remove: ' Mute retiré',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanctions')
    .setDescription("Affiche l'historique des sanctions d'un membre")
    .addUserOption((opt) =>
      opt.setName('membre').setDescription('Le membre à consulter').setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('membre', true);
    const guildId = interaction.guildId;

    const rows = getSanctionsForUser(guildId, target.id, 10);
    const total = countSanctionsForUser(guildId, target.id);

    if (!rows.length) {
      const payload = buildGrayContainer({
        title: ` Historique de ${target.tag}`,
        lines: ['Aucune sanction enregistrée pour ce membre.'],
        footer: 'Ursaaf',
      });
      return interaction.reply(payload);
    }

    const lines = rows.map((r) => {
      const date = `<t:${Math.floor(r.created_at / 1000)}:R>`;
      const label = TYPE_LABELS[r.type] || r.type;
      const duration = r.duration_ms ? ` (${Math.round(r.duration_ms / 60000)} min)` : '';
      return `${label}${duration} — ${date}\n> **Par :** ${r.moderator_tag ?? 'Inconnu'} — **Raison :** ${r.reason}`;
    });

    const payload = buildGrayContainer({
      title: ` Historique de ${target.tag} — ${total} sanction(s)`,
      lines,
      footer: 'Ursaaf',
    });

    await interaction.reply(payload);
  },
};