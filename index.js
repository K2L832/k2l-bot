const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const PREFIX = '=';

// Définition des catégories et des commandes pour le menu d'aide
const helpCategories = {
    sanctions: {
        label: 'Sanctions',
        emoji: '🔨',
        description: 'Gérer la modération et les bannissements',
        commands: [
            '`=ban <@membre> [raison]` : Bannir un utilisateur du serveur',
            '`=unban <id> [raison]` : Révoquer un bannissement par identifiant',
            '`=mute <@membre> [temps]` : Rendre un membre muet temporairement',
            '`=kick <@membre> [raison]` : Expulser un membre du serveur'
        ]
    },
    nettoyage: {
        label: 'Nettoyage',
        emoji: '🧹',
        description: 'Nettoyer et purger les salons textuels',
        commands: [
            '`=clear <nombre>` : Supprimer un nombre précis de messages',
            '`=purge <@membre>` : Nettoyer les messages d\'un utilisateur spécifique',
            '`=cleanup` : Nettoyer les messages épinglés ou inactifs'
        ]
    },
    salons: {
        label: 'Salons',
        emoji: '🔒',
        description: 'Gestion et paramétrage des salons du serveur',
        commands: [
            '`=lock [salon]` : Verrouiller l\'accès à un salon textuel',
            '`=unlock [salon]` : Déverrouiller un salon textuel',
            '`=slowmode <secondes>` : Définir le mode lent d\'un salon',
            '`=nuke [salon]` : Cloner et recréer un salon à neuf'
        ]
    },
    giveaways: {
        label: 'Giveaways',
        emoji: '🎉',
        description: 'Lancer et gérer des concours et tirages au sort',
        commands: [
            '`=gcreate <durée> <gagnants> <lot>` : Créer un nouveau giveaway',
            '`=gend <id_message>` : Arrêter un giveaway en cours',
            '`=greroll <id_message>` : Tirer de nouveaux gagnants'
        ]
    },
    tickets: {
        label: 'Tickets',
        emoji: '🎫',
        description: 'Système de support et de gestion des tickets',
        commands: [
            '`=ticketsetup` : Déployer le panneau de création de tickets',
            '`=ticketadd <@membre>` : Ajouter un utilisateur à un ticket',
            '`=ticketclose` : Fermer et archiver un ticket actif'
        ]
    },
    membres: {
        label: 'Membres & Rôles',
        emoji: '👤',
        description: 'Suivi des membres, statistiques et rôles automatiques',
        commands: [
            '`=invites [@membre]` : Vérifier le nombre d\'invitations d\'un membre',
            '`=autorole <rôle>` : Configurer les rôles automatiques à l\'arrivée',
            '`=leaderboard` : Afficher le classement des membres les plus actifs'
        ]
    },
    config: {
        label: 'Configuration',
        emoji: '⚙️',
        description: 'Paramètres généraux et logs du serveur',
        commands: [
            '`=setlog <#salon>` : Définir le salon des journaux de modération',
            '`=setwelcome <#salon> <message>` : Personnaliser le message d\'accueil'
        ]
    }
};

client.on('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} !`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Commande =help interactive
    if (command === 'help') {
        const defaultCategoryKey = 'sanctions';
        const cat = helpCategories[defaultCategoryKey];

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`${cat.emoji} ${cat.label}`)
            .setDescription(cat.commands.join('\n'))
            .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${cat.label}` });

        // Menu déroulant pour choisir la catégorie
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('📂 Choisir une catégorie...')
            .addOptions(
                Object.keys(helpCategories).map(key => ({
                    label: helpCategories[key].label,
                    description: helpCategories[key].description,
                    value: key,
                    emoji: helpCategories[key].emoji
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const sentMessage = await message.reply({ embeds: [embed], components: [row] });

        // Gestionnaire d'interactions pour le menu déroulant
        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "Tu n'as pas le droit d'utiliser ce menu !", ephemeral: true });
            }

            if (interaction.customId === 'help_menu') {
                const selectedKey = interaction.values[0];
                const selectedCat = helpCategories[selectedKey];

                const updatedEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`${selectedCat.emoji} ${selectedCat.label}`)
                    .setDescription(selectedCat.commands.join('\n'))
                    .setFooter({ text: `Demandé par ${message.author.tag} • Catégorie : ${selectedCat.label}` });

                await interaction.update({ embeds: [updatedEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            sentMessage.edit({ components: [] }).catch(() => {});
        });
    }
});

client.login('TON_TOKEN_BOT_DISCORD');
