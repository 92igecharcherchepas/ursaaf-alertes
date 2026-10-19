const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

// Couleur d'accent "full gris" pour toute la sidebar du container Components V2
const GRAY_ACCENT = 0x5a5c63; // gris neutre
const GRAY_ACCENT_DARK = 0x2b2d31; // gris foncé (style Discord dark)

/**
 * Construit un container Components V2 gris avec un titre, des lignes de contenu
 * et un footer optionnel. Retourne { components, flags } prêt à envoyer.
 */
function buildGrayContainer({ title, lines = [], footer, accent = GRAY_ACCENT }) {
  const container = new ContainerBuilder().setAccentColor(accent);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}`)
  );

  if (lines.length) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    );
  }

  if (footer) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${footer}`)
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildGrayContainer, GRAY_ACCENT, GRAY_ACCENT_DARK };