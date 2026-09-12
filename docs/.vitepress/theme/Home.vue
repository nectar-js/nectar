<script setup lang="ts">
import { withBase } from "vitepress";
import { onUnmounted, ref } from "vue";

interface ExampleFile {
  /** Slot name for the file's code in index.md. */
  id: string;
  /** Path before the route, the route itself, and the file name. */
  area: string;
  route: string;
  file: string;
  result: string;
  label: string;
  guide: string;
  note: string;
}

const files: ExampleFile[] = [
  {
    id: "ping",
    label: "Commands",
    guide: "/guides/commands",
    note: "A command is a file with metadata and a handler. Nectar registers it with Discord.",
    area: "app/commands/",
    route: "ping",
    file: "/command.ts",
    result: "Slash command /ping",
  },
  {
    id: "ban",
    label: "Subcommands",
    guide: "/guides/commands#subcommands",
    note: "Nested folders become subcommands. Add a route.ts to describe the parent command.",
    area: "app/commands/",
    route: "moderation/ban",
    file: "/command.ts",
    result: "Subcommand /moderation ban",
  },
  {
    id: "guard",
    label: "Middleware",
    guide: "/guides/middleware",
    note: "One middleware file protects every command in the moderation directory.",
    area: "app/commands/",
    route: "moderation",
    file: "/middleware.ts",
    result: "Middleware for /moderation",
  },
  {
    id: "close",
    label: "Components",
    guide: "/guides/components",
    note: "Route parameters carry the ticket ID from a button into its handler.",
    area: "app/components/",
    route: "tickets/[ticketId]/close",
    file: "/button.ts",
    result: "Button with a ticket ID",
  },
  {
    id: "welcome",
    label: "Events",
    guide: "/guides/events",
    note: "Use discord.js events directly. Add GuildMembers to your intents for this listener.",
    area: "app/events/",
    route: "guildMemberAdd",
    file: "/event.ts",
    result: "Event when a member joins",
  },
];

/** A file's path in pieces: the route's own segments stand out, parameters most of all. */
function parts({ area, route, file }: ExampleFile) {
  return [
    ...area
      .split("/")
      .filter(Boolean)
      .map((text) => ({ text, kind: "dim" })),
    ...route.split("/").map((text) => ({ text, kind: text.startsWith("[") ? "param" : "segment" })),
    { text: file.slice(1), kind: "dim" },
  ];
}

const selected = ref(0);
const tabs: HTMLButtonElement[] = [];

function select(index: number, focus = false) {
  selected.value = (index + files.length) % files.length;
  ticketClosed.value = false;
  if (focus) tabs[selected.value]?.focus();
}

function onKeydown(event: KeyboardEvent) {
  const moves: Record<string, number> = {
    ArrowDown: selected.value + 1,
    ArrowRight: selected.value + 1,
    ArrowUp: selected.value - 1,
    ArrowLeft: selected.value - 1,
    Home: 0,
    End: files.length - 1,
  };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  select(next, true);
}

const ticketClosed = ref(false);
const locale = ref<"en-US" | "fr" | "pt-BR">("en-US");
const translations = {
  "en-US": "Welcome, @newcomer!",
  fr: "Bienvenue, @newcomer !",
  "pt-BR": "Boas-vindas, @newcomer!",
};
const install = "npm create @nectar-js";
const copyState = ref("Copy");
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyInstall() {
  clearTimeout(copyTimer);
  try {
    await navigator.clipboard.writeText(install);
    copyState.value = "Copied";
  } catch {
    copyState.value = "Select to copy";
  }
  copyTimer = setTimeout(() => {
    copyState.value = "Copy";
  }, 2000);
}

onUnmounted(() => clearTimeout(copyTimer));
</script>

<template>
  <div class="home">
    <section class="intro">
      <h1>Your Discord bot.<br /><span>One file at a time.</span></h1>
      <div class="intro-detail">
        <div class="actions">
          <a class="docs" :href="withBase('/getting-started/installation')">Build your first bot <span aria-hidden="true">↗</span></a>
          <a class="text-link" :href="withBase('/introduction')">Explore the docs</a>
        </div>
        <button type="button" class="install" @click="copyInstall" aria-label="Copy npm create @nectar-js">
          <span class="prompt" aria-hidden="true">$</span>
          <code>{{ install }}</code>
          <span class="copy" aria-live="polite">{{ copyState }}</span>
        </button>
      </div>
    </section>

    <div class="showcase-heading">
      <h2>From file to Discord.</h2>
      <p>Choose a file to see its handler and result.</p>
    </div>
    <section class="explorer" aria-label="An example app">
      <div class="files" role="tablist" aria-orientation="horizontal" @keydown="onKeydown">
        <button
          v-for="(file, i) in files"
          :id="`tab-${file.id}`"
          :key="file.id"
          :ref="(el) => (tabs[i] = el as HTMLButtonElement)"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="i === selected"
          :aria-controls="`panel-${file.id}`"
          :tabindex="i === selected ? 0 : -1"
          @click="select(i)"
        >
          <span class="result">{{ file.label }}</span>
        </button>
      </div>

      <div class="panels">
        <div
          v-for="(file, i) in files"
          v-show="i === selected"
          :id="`panel-${file.id}`"
          :key="file.id"
          role="tabpanel"
          class="panel"
          :class="{ active: i === selected }"
          :aria-labelledby="`tab-${file.id}`"
          tabindex="0"
        >
          <div class="editor">
            <div class="editor-heading">
              <span class="path">
                <template v-for="(part, j) in parts(file)" :key="j">
                  <template v-if="j > 0"><span class="dim">/</span><wbr /></template>
                  <span :class="part.kind">{{ part.text }}</span>
                </template>
              </span>
              <span class="file-type">TypeScript</span>
            </div>
            <div class="code vp-doc"><slot :name="file.id" /></div>
          </div>
          <div class="preview">
            <div class="preview-heading">Discord preview <span aria-hidden="true"># bot-playground</span></div>
            <div class="discord" aria-live="polite">
            <template v-if="file.id === 'ping'">
              <p class="used">you used <span class="command">/ping</span></p>
              <div class="message">
                <img class="avatar" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="author">Nectar <span class="app">APP</span></p>
                  <p>Pong.</p>
                </div>
              </div>
            </template>

            <template v-else-if="file.id === 'ban'">
              <div class="picker">
                <img class="icon" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="picked">/moderation ban</p>
                  <p class="description">Ban a member</p>
                </div>
                <span class="source">Nectar</span>
              </div>
              <div class="input">
                <span class="typed">/moderation ban</span>
                <span class="option"><span class="key">target</span> @spammer</span>
              </div>
            </template>

            <template v-else-if="file.id === 'guard'">
              <p class="used">you used <span class="command">/moderation ban</span></p>
              <div class="message">
                <img class="avatar" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="author">Nectar <span class="app">APP</span></p>
                  <p>You do not have permission to do that.</p>
                  <p class="ephemeral">Only you can see this</p>
                </div>
              </div>
            </template>

            <template v-else-if="file.id === 'close'">
              <div class="message">
                <img class="avatar" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="author">Nectar <span class="app">APP</span></p>
                  <p>{{ ticketClosed ? "Ticket 42 closed." : "Ticket 42 is open." }}</p>
                  <button v-if="!ticketClosed" type="button" class="button" @click="ticketClosed = true">Close ticket</button>
                  <button v-else type="button" class="reset" @click="ticketClosed = false">Reset preview</button>
                </div>
              </div>
            </template>

            <template v-else>
              <p class="joined"><span class="arrow" aria-hidden="true">→</span> newcomer joined the server.</p>
              <div class="message">
                <img class="avatar" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="author">Nectar <span class="app">APP</span></p>
                  <p>Welcome, <span class="mention">@newcomer</span>!</p>
                </div>
              </div>
            </template>
            </div>
            <div class="preview-caption">
              <h3>{{ file.result }}</h3>
              <p>{{ file.note }}</p>
              <a :href="withBase(file.guide)">Read the guide <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="package-showcase" aria-labelledby="package-title">
      <div class="package-copy">
        <a class="package-name" :href="withBase('/packages/')">Nectar packages <span aria-hidden="true">↗</span></a>
        <h2 id="package-title">Let your bot<br />speak their language.</h2>
        <p><code>@nectar-js/i18n</code> translates replies and command descriptions from JSON catalogs, with typed message keys and variables.</p>
        <a class="text-link" :href="withBase('/packages/i18n/')">Add translations <span aria-hidden="true">↗</span></a>
      </div>
      <div class="translation-example">
        <div class="translation-code vp-doc"><slot name="translation" /></div>
        <div class="translation-output">
          <div class="languages" role="group" aria-label="Preview language">
            <button v-for="(message, language) in translations" :key="language" type="button" :aria-pressed="locale === language" @click="locale = language">{{ language }}</button>
          </div>
          <p class="translated" aria-live="polite" :lang="locale">{{ translations[locale] }}</p>
        </div>
      </div>
    </section>

    <section class="next-steps" aria-labelledby="next-title">
      <h2 id="next-title">Make it your bot.</h2>
      <div class="next-links">
        <a :href="withBase('/guides/project-structure')"><span>Organize your project</span><span aria-hidden="true">↗</span></a>
        <a :href="withBase('/guides/development')"><span>Develop with live reload</span><span aria-hidden="true">↗</span></a>
        <a :href="withBase('/guides/deployment')"><span>Take it to production</span><span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1248px;
  margin: 0 auto;
  padding: 76px 40px 64px;
}

.intro {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  align-items: center;
  gap: 64px;
}

h1 {
  margin: 0;
  font-size: clamp(38px, 4.5vw, 64px);
  line-height: 1.12;
  letter-spacing: -0.045em;
  font-weight: 760;
  font-variation-settings: "MONO" 0, "CASL" 0.35;
}

h1 span {
  color: var(--vp-c-brand-1);
}

.lede {
  max-width: 430px;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 17px;
  line-height: 1.7;
}

.lede code {
  color: var(--vp-c-text-1);
  font-size: 0.9em;
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 24px;
}

.docs {
  display: inline-flex;
  gap: 18px;
  align-items: center;
  padding: 13px 18px;
  background: var(--honey);
  color: var(--propolis);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 650;
  transition: background-color .18s;
}

.docs:hover {
  background: #ffb838;
}

.text-link {
  font-size: 14px;
  font-weight: 600;
}

.text-link:hover {
  color: var(--vp-c-brand-1);
}

.install {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 4px 0;
  text-align: left;
}

.install code {
  font-size: 13px;
  user-select: text;
}

.prompt, .copy {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.copy {
  margin-left: 12px;
  min-width: 50px;
}

a:focus-visible, button:focus-visible, .panel:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

.showcase-heading {
  margin: 64px 0 18px;
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
}

.showcase-heading h2 {
  font-size: 18px;
  font-weight: 650;
}

.showcase-heading p {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.explorer {
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-elv);
  box-shadow: 0 18px 50px -32px #6a482f40;
}

.files {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-alt);
  overflow-x: auto;
}

.tab {
  flex: 1;
  min-width: max-content;
  padding: 11px 18px;
  border-radius: 6px;
  text-align: center;
  transition: background-color .18s, color .18s;
  color: var(--vp-c-text-2);
}

.tab:hover {
  background: var(--vp-c-default-soft);
}

.tab[aria-selected="true"] {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.result {
  font-size: 14px;
  font-weight: 620;
}

.panel {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
  min-height: 380px;
}

.panel.active {
  animation: appear .2s ease-out;
}

@keyframes appear {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
}

.editor {
  min-width: 0;
}

.editor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 12px 22px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.path {
  font-family: var(--vp-font-family-mono);
  font-variation-settings: "MONO" 1;
  font-size: 12px;
  line-height: 1.6;
}

.dim {
  color: var(--vp-c-text-2);
}

.segment {
  color: var(--vp-c-text-1);
}

.param {
  color: var(--vp-c-brand-1);
}

.file-type {
  flex: none;
  color: var(--vp-c-text-2);
  font-size: 10px;
}

.code, .translation-code {
  --vp-code-block-bg: transparent;
}

.code :deep(div[class*="language-"]), .translation-code :deep(div[class*="language-"]) {
  margin: 0;
  border-radius: 0;
}

.code :deep(.lang), .translation-code :deep(.lang) {
  display: none;
}

.code :deep(pre) {
  padding: 22px;
}

.code :deep(code), .translation-code :deep(code) {
  font-size: 12px;
  line-height: 1.8;
}

.preview {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-alt);
}

.preview-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding: 15px 20px;
  font-size: 11px;
  color: var(--vp-c-text-2);
  border-bottom: 1px solid var(--vp-c-divider);
}

.preview-heading span {
  font-family: var(--vp-font-family-mono);
  font-variation-settings: "MONO" 1;
  font-size: 10px;
}

.discord {
  min-height: 150px;
  padding: 24px 20px;
  color: var(--vp-c-text-1);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

.discord p {
  margin: 0;
}

.message {
  display: flex;
  gap: 10px;
}

.avatar {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--vp-c-brand-soft);
  padding: 5px;
}

.author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
}

.app {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 9px;
  font-weight: 700;
}

.discord .used, .discord .joined {
  margin-bottom: 12px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.command, .mention, .arrow {
  color: var(--vp-c-brand-1);
}

.discord .ephemeral {
  margin-top: 7px;
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.button {
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 5px;
  background: var(--honey);
  color: var(--propolis);
  font-size: 12px;
  font-weight: 600;
}

.button:hover {
  background: #ffb838;
}

.reset {
  margin-top: 10px;
  color: var(--vp-c-brand-1);
  font-size: 12px;
  text-decoration: underline;
}

.picker {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
}

.icon {
  width: 28px;
  height: 28px;
}

.picked {
  font-weight: 600;
}

.description, .source {
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.source {
  margin-left: auto;
}

.input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  font-size: 12px;
}

.option {
  padding: 1px 5px;
  background: var(--vp-c-default-soft);
  border-radius: 3px;
}

.key {
  color: var(--vp-c-text-2);
}

.preview-caption {
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid var(--vp-c-divider);
}

.preview-caption h3 {
  font-size: 13px;
  font-weight: 650;
}

.preview-caption p {
  margin: 8px 0 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.preview-caption a {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 600;
}

.package-showcase {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  align-items: center;
  gap: 88px;
  margin-top: 100px;
}

.package-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.package-copy h2 {
  margin-top: 16px;
  font-size: clamp(28px, 3vw, 38px);
  line-height: 1.2;
  letter-spacing: -.035em;
  font-weight: 700;
}

.package-copy p {
  margin: 20px 0;
  max-width: 400px;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.7;
}

.package-copy code {
  font-size: 13px;
  color: var(--vp-c-text-1);
}

.translation-example {
  min-width: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
}

.translation-code :deep(pre) {
  padding: 24px;
}

.translation-output {
  padding: 24px;
  border-top: 1px solid var(--vp-c-border);
}

.languages {
  display: flex;
  gap: 6px;
}

.languages button {
  min-height: 36px;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.languages button:hover {
  background: var(--vp-c-default-soft);
}

.languages button[aria-pressed="true"] {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.translated {
  margin: 20px 0 2px;
  font-size: clamp(16px, 2vw, 22px);
  letter-spacing: -.02em;
}

.next-steps {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 88px;
  margin-top: 80px;
  padding-top: 36px;
  border-top: 1px solid var(--vp-c-border);
}

.next-steps h2 {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -.03em;
}

.next-links a {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  font-size: 14px;
}

.next-links a:hover {
  color: var(--vp-c-brand-1);
}

@media (max-width: 1023px) {
  .home {
    padding: 48px 28px;
  }
  .intro {
    gap: 32px;
  }
  h1 {
    font-size: 46px;
  }
  .actions {
    gap: 16px;
  }
  .panel {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }
  .file-type {
    display: none;
  }
  .package-showcase, .next-steps {
    gap: 40px;
  }
}

@media (max-width: 767px) {
  .home {
    padding: 36px 20px 48px;
  }
  .intro {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  h1 {
    font-size: clamp(34px, 7.5vw, 52px);
  }
  .lede {
    font-size: 15px;
    max-width: 480px;
  }
  .showcase-heading {
    margin-top: 44px;
    display: block;
  }
  .showcase-heading p {
    margin-top: 6px;
  }
  .files {
    padding: 8px;
  }
  .tab {
    padding: 10px 12px;
  }
  .panel {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .editor {
    min-height: 290px;
  }
  .editor-heading {
    padding: 12px 16px;
  }
  .code :deep(pre) {
    padding: 20px 16px;
  }
  .preview {
    border-left: 0;
    border-top: 1px solid var(--vp-c-border);
  }
  .discord {
    min-height: 130px;
  }
  .package-showcase, .next-steps {
    grid-template-columns: 1fr;
    gap: 28px;
    margin-top: 56px;
  }
  .package-copy h2 {
    font-size: 32px;
  }
  .translation-code :deep(pre) {
    padding: 20px 16px;
  }
  .translation-output {
    padding: 20px 16px;
  }
  .next-steps {
    gap: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel.active {
    animation: none;
  }
  .docs, .tab {
    transition: none;
  }
}

</style>
