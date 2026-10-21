import axios from "axios";
import { Client, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const prefix = ",";
const maxNamesPerCheck = 10;

if (!token) {
  throw new Error("Le secret DISCORD_TOKEN doit être configuré avant le démarrage.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function validateUsernameFormat(input) {
  const username = input.trim().toLowerCase();
  const basicRulesMatch =
    username.length >= 2 &&
    username.length <= 32 &&
    /^[a-z0-9._]+$/.test(username) &&
    !username.startsWith(".") &&
    !username.endsWith(".") &&
    !username.includes("..");

  return { username, valid: basicRulesMatch };
}

function generateSuggestions(count = 5) {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  const suggestions = new Set();

  while (suggestions.size < count) {
    let suggestion = "";
    for (let index = 0; index < 4; index += 1) {
      suggestion += characters[Math.floor(Math.random() * characters.length)];
    }
    suggestions.add(suggestion);
  }

  return [...suggestions];
}

async function getBotIdentity() {
  const response = await axios.get("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
    timeout: 10_000,
  });

  return response.data;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot K2L connecté en tant que ${readyClient.user.tag}.`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild() || !message.content.startsWith(prefix)) {
    return;
  }

  const commandText = message.content.slice(prefix.length).trim();
  const [command = "", ...rest] = commandText.split(/\s+/);
  const rawInput = rest.join(" ").trim();
  const reply = (content, embeds = []) =>
    message.reply({
      content,
      embeds,
      allowedMentions: { parse: [] },
    });

  try {
    if (command.toLowerCase() === "check") {
      if (!rawInput) {
        await reply("Utilisation : `,check pseudo1,pseudo2,pseudo3`");
        return;
      }

      const names = [...new Set(rawInput.split(",").map((name) => name.trim()).filter(Boolean))];
      if (names.length === 0) {
        await reply("Ajoute au moins un pseudo après la commande `,check`.");
        return;
      }
      if (names.length > maxNamesPerCheck) {
        await reply(`Tu peux vérifier le format de ${maxNamesPerCheck} pseudos maximum par commande.`);
        return;
      }

      const results = names.map(validateUsernameFormat);
      const lines = results.map(({ username, valid }) => {
        const safeUsername = username.replace(/[\\`]/g, "\\$&");
        return valid
          ? `✅ \`${safeUsername}\` — format de base correct ; disponibilité non vérifiée.`
          : `❌ \`${safeUsername}\` — format de base incorrect.`;
      });

      const embed = new EmbedBuilder()
        .setTitle("Vérification du format")
        .setDescription(lines.join("\n"))
        .setColor(0x5865f2)
        .setFooter({ text: "Un bot ne peut pas confirmer la disponibilité des pseudos." })
        .setTimestamp();

      await reply("", [embed]);
      return;
    }

    if (command.toLowerCase() === "suggest") {
      const suggestions = generateSuggestions();
      const embed = new EmbedBuilder()
        .setTitle("Idées de pseudos")
        .setDescription(suggestions.map((name) => `• \`${name}\``).join("\n"))
        .setColor(0x5865f2)
        .setFooter({ text: "Suggestions générées automatiquement ; disponibilité non vérifiée." })
        .setTimestamp();

      await reply("", [embed]);
      return;
    }

    if (command.toLowerCase() === "bot") {
      try {
        const identity = await getBotIdentity();
        await reply(`Connecté à l’API Discord en tant que **${identity.username}** (ID : \`${identity.id}\`).`);
      } catch {
        await reply("Impossible de récupérer les informations du bot auprès de l’API officielle Discord.");
      }
      return;
    }

    await reply(
      [
        "**Commandes du bot K2L**",
        "`,check pseudo1,pseudo2` — vérifie uniquement le format de base.",
        "`,suggest` — génère des idées de pseudos non vérifiées.",
        "`,bot` — affiche l’identité du bot via l’API officielle Discord.",
      ].join("\n"),
    );
  } catch (error) {
    console.error("Erreur lors du traitement d’une commande Discord.");
    await reply("Une erreur est survenue pendant le traitement de la commande.");
  }
});

client.login(token).catch((error) => {
  console.error("Connexion à Discord impossible. Vérifie le token et les intents du bot.");
  process.exitCode = 1;
});
