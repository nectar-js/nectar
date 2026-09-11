import { type BitFieldResolvable, GatewayIntentBits, IntentsBitField } from "discord.js";
import type { Diagnostic } from "../compiler/diagnostics.js";
import type { CompiledEvent } from "./compile.js";

type Intent = keyof typeof GatewayIntentBits;

const PRIVILEGED: ReadonlySet<Intent> = new Set([
  "GuildMembers",
  "GuildPresences",
  "MessageContent",
]);

const guildOrDm = (guild: Intent, dm: Intent): Intent[] => [guild, dm];

/**
 * Which intent a gateway event needs. A list means any one of them is enough: message events
 * arrive with either the guild or the direct message intent. Events missing here need none.
 */
const REQUIRED: Record<string, Intent[]> = {
  guildCreate: ["Guilds"],
  guildUpdate: ["Guilds"],
  guildDelete: ["Guilds"],
  guildAvailable: ["Guilds"],
  guildUnavailable: ["Guilds"],
  channelCreate: ["Guilds"],
  channelUpdate: ["Guilds"],
  channelDelete: ["Guilds"],
  channelPinsUpdate: ["Guilds"],
  threadCreate: ["Guilds"],
  threadUpdate: ["Guilds"],
  threadDelete: ["Guilds"],
  threadListSync: ["Guilds"],
  threadMemberUpdate: ["Guilds"],
  threadMembersUpdate: ["GuildMembers"],
  stageInstanceCreate: ["Guilds"],
  stageInstanceUpdate: ["Guilds"],
  stageInstanceDelete: ["Guilds"],
  roleCreate: ["Guilds"],
  roleUpdate: ["Guilds"],
  roleDelete: ["Guilds"],
  guildMemberAdd: ["GuildMembers"],
  guildMemberUpdate: ["GuildMembers"],
  guildMemberRemove: ["GuildMembers"],
  guildMemberAvailable: ["GuildMembers"],
  guildMembersChunk: ["GuildMembers"],
  userUpdate: ["GuildMembers"],
  guildBanAdd: ["GuildModeration"],
  guildBanRemove: ["GuildModeration"],
  guildAuditLogEntryCreate: ["GuildModeration"],
  emojiCreate: ["GuildExpressions"],
  emojiUpdate: ["GuildExpressions"],
  emojiDelete: ["GuildExpressions"],
  stickerCreate: ["GuildExpressions"],
  stickerUpdate: ["GuildExpressions"],
  stickerDelete: ["GuildExpressions"],
  guildSoundboardSoundCreate: ["GuildExpressions"],
  guildSoundboardSoundUpdate: ["GuildExpressions"],
  guildSoundboardSoundDelete: ["GuildExpressions"],
  guildSoundboardSoundsUpdate: ["GuildExpressions"],
  guildIntegrationsUpdate: ["GuildIntegrations"],
  webhooksUpdate: ["GuildWebhooks"],
  inviteCreate: ["GuildInvites"],
  inviteDelete: ["GuildInvites"],
  voiceStateUpdate: ["GuildVoiceStates"],
  voiceChannelEffectSend: ["GuildVoiceStates"],
  presenceUpdate: ["GuildPresences"],
  messageCreate: guildOrDm("GuildMessages", "DirectMessages"),
  messageUpdate: guildOrDm("GuildMessages", "DirectMessages"),
  messageDelete: guildOrDm("GuildMessages", "DirectMessages"),
  messageDeleteBulk: ["GuildMessages"],
  messageReactionAdd: guildOrDm("GuildMessageReactions", "DirectMessageReactions"),
  messageReactionRemove: guildOrDm("GuildMessageReactions", "DirectMessageReactions"),
  messageReactionRemoveAll: guildOrDm("GuildMessageReactions", "DirectMessageReactions"),
  messageReactionRemoveEmoji: guildOrDm("GuildMessageReactions", "DirectMessageReactions"),
  typingStart: guildOrDm("GuildMessageTyping", "DirectMessageTyping"),
  messagePollVoteAdd: guildOrDm("GuildMessagePolls", "DirectMessagePolls"),
  messagePollVoteRemove: guildOrDm("GuildMessagePolls", "DirectMessagePolls"),
  guildScheduledEventCreate: ["GuildScheduledEvents"],
  guildScheduledEventUpdate: ["GuildScheduledEvents"],
  guildScheduledEventDelete: ["GuildScheduledEvents"],
  guildScheduledEventUserAdd: ["GuildScheduledEvents"],
  guildScheduledEventUserRemove: ["GuildScheduledEvents"],
  autoModerationRuleCreate: ["AutoModerationConfiguration"],
  autoModerationRuleUpdate: ["AutoModerationConfiguration"],
  autoModerationRuleDelete: ["AutoModerationConfiguration"],
  autoModerationActionExecution: ["AutoModerationExecution"],
};

/** The intents an event route depends on, for tooling. Empty when it needs none. */
export function requiredIntents(event: string): readonly Intent[] {
  return REQUIRED[event] ?? [];
}

/**
 * One warning per event whose handlers can never fire with the configured intents. Never
 * changes the config: privileged intents in particular must be a deliberate choice, made here
 * and in the developer portal.
 */
export function checkIntents(
  events: readonly CompiledEvent[],
  intents: BitFieldResolvable<Intent, number>,
  configFile: string,
): Diagnostic[] {
  const enabled = new IntentsBitField(IntentsBitField.resolve(intents));
  const diagnostics: Diagnostic[] = [];
  for (const event of events) {
    const needed = requiredIntents(event.name);
    if (needed.length === 0 || needed.some((intent) => enabled.has(GatewayIntentBits[intent]))) {
      continue;
    }
    const first = event.handlers[0];
    if (first === undefined) continue;
    const names = needed.map((i) => `"${i}"`).join(" or ");
    const privileged = needed.filter((i) => PRIVILEGED.has(i));
    diagnostics.push({
      code: "missing-intent",
      severity: "warning",
      message: `"${event.name}" never fires without the ${names} intent. Add it to intents in ${configFile}.${
        privileged.length === 0
          ? ""
          : ` ${privileged.map((i) => `"${i}"`).join(" and ")} is privileged, so also turn it on under Bot in the Discord Developer Portal.`
      }`,
      file: first.route.file,
      route: first.route.id,
    });
  }
  return diagnostics;
}
