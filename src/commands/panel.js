const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { setLogChannel, getLogConfig, clearLogChannel } = require('../database');
const { buildGrayContainer } = require('../components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Configurer le salon de logs des sanctions (peut être sur un autre serveur)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setlog')
        .setDescription("Définit le salon où envoyer les logs de ce serveur")
        .addStringOption((opt) =>
          opt
            .setName('id_salon')
            .setDescription(
              "ID du salon (clic droit > Copier l'ID). Peut être sur un autre serveur si Ursaaf y est présent."
            )
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Affiche la configuration actuelle des logs')
    )
    .addSubcommand((sub) =>
      sub.setName('unset').setDescription('Retire le salon de logs configuré')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'setlog') {
      const channelId = interaction.options.getString('id_salon', true).trim();

      await interaction.deferReply({ ephemeral: true });

      let channel;
      try {
        channel = await interaction.client.channels.fetch(channelId);
      } catch {
        channel = null;
      }

      if (!channel) {
        return interaction.editReply(
          " Salon introuvable. Vérifie que l'ID est correct et qu'Ursaaf est bien présent sur le serveur qui contient ce salon."
        );
      }

      const textLikeTypes = [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
      ];
      if (!textLikeTypes.includes(channel.type)) {
        return interaction.editReply(' Ce salon n\'est pas un salon textuel valide.');
      }

      const me = channel.guild.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.ViewChannel)) {
        return interaction.editReply(
          ` Ursaaf n'a pas la permission d'envoyer des messages dans <#${channel.id}> sur **${channel.guild.name}**. Vérifie ses permissions là-bas.`
        );
      }

      setLogChannel({
        guildId,
        logChannelId: channel.id,
        logGuildId: channel.guild.id,
        updatedBy: interaction.user.id,
      });

      const payload = buildGrayContainer({
        title: ' Salon de logs configuré',
        lines: [
          `**Salon :** #${channel.name} (${channel.id})`,
          `**Serveur du salon :** ${channel.guild.name}${channel.guild.id === guildId ? ' (ce serveur)' : ' (serveur externe)'}`,
          `**Configuré par :** <@${interaction.user.id}>`,
        ],
        footer: 'Ursaaf',
      });
      return interaction.editReply(payload);
    }

    if (sub === 'status') {
      const config = getLogConfig(guildId);
      if (!config || !config.log_channel_id) {
        const payload = buildGrayContainer({
          title: '⚙️ Configuration des logs',
          lines: ['Aucun salon de logs configuré pour ce serveur.', 'Utilise `/panel setlog` pour en définir un.'],
          footer: 'Ursaaf',
        });
        return interaction.reply({ ...payload, ephemeral: true });
      }

      let channelInfo = `${config.log_channel_id} (introuvable / inaccessible)`;
      try {
        const channel = await interaction.client.channels.fetch(config.log_channel_id);
        channelInfo = `#${channel.name} sur **${channel.guild.name}**`;
      } catch {
        // laisse le message par défaut
      }

      const payload = buildGrayContainer({
        title: '⚙️ Configuration des logs',
        lines: [
          `**Salon actuel :** ${channelInfo}`,
          `**Dernière modif :** <t:${Math.floor(config.updated_at / 1000)}:R> par <@${config.updated_by}>`,
        ],
        footer: 'Ursaaf',
      });
      return interaction.reply({ ...payload, ephemeral: true });
    }

    if (sub === 'unset') {
      clearLogChannel(guildId);
      const payload = buildGrayContainer({
        title: '🗑️ Salon de logs retiré',
        lines: ['Les sanctions ne seront plus reportées tant qu\'aucun salon n\'est reconfiguré.'],
        footer: 'Ursaaf',
      });
      return interaction.reply({ ...payload, ephemeral: true });
    }
  },
};