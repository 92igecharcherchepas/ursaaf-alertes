require('dotenv').config();
const { REST, Routes } = require('discord.js');
const sanctionsCommand = require('./src/commands/sanctions');
const panelCommand = require('./src/commands/panel');

const commands = [sanctionsCommand.data.toJSON(), panelCommand.data.toJSON()];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// GUILD_IDS accepte un ou plusieurs IDs séparés par des virgules,
// ex: "111111111111111111,222222222222222222"
// (le serveur surveillé ET le serveur de logs, si tu veux /panel utilisable sur les deux)
const guildIds = (process.env.GUILD_IDS || process.env.GUILD_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

(async () => {
  if (!guildIds.length) {
    console.error(' Aucun GUILD_IDS/GUILD_ID défini dans le .env');
    return;
  }
  try {
    for (const guildId of guildIds) {
      console.log(`⏳ Déploiement des commandes sur ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
      );
      console.log(` Commandes déployées sur ${guildId}.`);
    }
  } catch (err) {
    console.error(err);
  }
})();