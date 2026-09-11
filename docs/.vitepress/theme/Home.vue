<script setup lang="ts">
import { withBase } from "vitepress";
import { ref } from "vue";

interface ExampleFile {
  /** Slot name for the file's code in index.md. */
  id: string;
  /** Path before the route, the route itself, and the file name. */
  area: string;
  route: string;
  file: string;
  result: string;
}

const files: ExampleFile[] = [
  {
    id: "ping",
    area: "app/commands/",
    route: "ping",
    file: "/command.ts",
    result: "Slash command /ping",
  },
  {
    id: "ban",
    area: "app/commands/",
    route: "moderation/ban",
    file: "/command.ts",
    result: "Subcommand /moderation ban",
  },
  {
    id: "close",
    area: "app/components/",
    route: "tickets/[ticketId]/close",
    file: "/button.ts",
    result: "Button with a ticket ID",
  },
  {
    id: "welcome",
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

const install = "npm create @nectar-js";
const copied = ref(false);

async function copyInstall() {
  await navigator.clipboard.writeText(install);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1600);
}
</script>

<template>
  <div class="home">
    <section class="intro">
      <h1>A filesystem-based meta-framework for discord.js</h1>
      <p class="lede">
        Commands, components, and events are files in <code>app/</code>. Nectar registers the
        commands and routes each interaction to its file.
      </p>
      <div class="actions">
        <a class="docs" :href="withBase('/introduction')">Read the docs</a>
        <button type="button" class="install" @click="copyInstall">
          <code>{{ install }}</code>
          <span class="copy" aria-live="polite">{{ copied ? "Copied" : "Copy" }}</span>
        </button>
      </div>
    </section>

    <section class="explorer" aria-label="An example app">
      <div class="files" role="tablist" aria-orientation="vertical" @keydown="onKeydown">
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
          <span class="path">
            <template v-for="(part, j) in parts(file)" :key="j">
              <template v-if="j > 0"><span class="dim">/</span><wbr /></template>
              <span :class="part.kind">{{ part.text }}</span>
            </template>
          </span>
          <span class="result">{{ file.result }}</span>
        </button>
      </div>

      <div class="panels">
        <div
          v-for="(file, i) in files"
          :id="`panel-${file.id}`"
          :key="file.id"
          role="tabpanel"
          class="panel"
          :class="{ active: i === selected }"
          :aria-labelledby="`tab-${file.id}`"
          :inert="i !== selected"
        >
          <div class="code vp-doc">
            <slot :name="file.id" />
          </div>

          <div class="discord">
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

            <template v-else-if="file.id === 'close'">
              <div class="message">
                <img class="avatar" :src="withBase('/logo.png')" alt="" />
                <div>
                  <p class="author">Nectar <span class="app">APP</span></p>
                  <p>Ticket 42 is open.</p>
                  <span class="button">Close</span>
                  <p class="custom-id">custom_id <code>n:31imou:42</code></p>
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
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1152px;
  margin: 0 auto;
  padding: 48px 24px 96px;
}

@media (min-width: 768px) {
  .home {
    padding: 88px 48px 128px;
  }
}

.intro {
  max-width: 760px;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 1rem + 4.4vw, 4.25rem);
  line-height: 1.02;
  letter-spacing: -0.025em;
  font-weight: 780;
  font-variation-settings:
    "MONO" 0,
    "CASL" 0.45;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}

.lede {
  margin: 24px 0 0;
  max-width: 34em;
  font-size: 1.1875rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.lede code {
  font-size: 0.9em;
  color: var(--vp-c-text-1);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 36px;
}

.docs,
.install {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  border-radius: 10px;
  font-size: 15px;
  transition: background-color 0.2s;
}

.docs {
  padding: 0 22px;
  background: var(--honey);
  color: var(--propolis);
  font-weight: 650;
}

.docs:hover {
  background: #ffb838;
}

.install {
  gap: 20px;
  padding: 0 16px 0 20px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.install:hover {
  background: var(--vp-c-bg-alt);
}

.install code {
  font-size: 14px;
}

.copy {
  color: var(--vp-c-text-3);
  font-size: 13px;
}

.docs:focus-visible,
.install:focus-visible,
.tab:focus-visible {
  outline: 2px solid var(--honey);
  outline-offset: 2px;
}

/* The explorer is dark in both themes: code and Discord both are. */
.explorer {
  --vp-c-text-1: #f4e9d8;
  --vp-c-text-2: #bcae9b;
  --vp-c-text-3: #857766;
  --vp-c-divider: #2b2117;
  --vp-c-border: #3b2e21;
  --vp-code-block-bg: transparent;
  --vp-code-lang-color: #857766;
  --vp-code-copy-code-border-color: #3b2e21;
  --vp-code-copy-code-bg: #241b13;
  --vp-code-copy-code-hover-border-color: #4a3b2c;
  --vp-code-copy-code-hover-bg: #2c2218;
  --vp-code-copy-code-active-text: #bcae9b;
  --vp-code-copy-copied-text-content: "Copied";

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin-top: 64px;
  border: 1px solid #3b2e21;
  border-radius: 16px;
  background: #16100b;
  overflow: hidden;
  color: var(--vp-c-text-1);
}

@media (min-width: 960px) {
  .explorer {
    grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  }
}

.files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-bottom: 1px solid #3b2e21;
}

@media (min-width: 960px) {
  .files {
    border-bottom: 0;
    border-right: 1px solid #3b2e21;
  }
}

.tab {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 10px;
  text-align: left;
  box-shadow: inset 2px 0 0 transparent;
  transition:
    background-color 0.2s,
    box-shadow 0.2s;
}

.tab:hover {
  background: rgba(244, 233, 216, 0.04);
}

.tab[aria-selected="true"] {
  background: rgba(245, 165, 36, 0.09);
  box-shadow: inset 2px 0 0 var(--honey);
}

.path {
  font-family: var(--vp-font-family-mono);
  font-variation-settings: "MONO" 1;
  font-size: 13px;
  line-height: 1.5;
}

.dim {
  color: #7d705f;
}

.segment {
  color: #f4e9d8;
}

.param {
  color: var(--honey);
}

.result {
  font-size: 14px;
  color: #bcae9b;
}

.panels {
  display: grid;
  min-width: 0;
}

/* Every panel shares one cell, so the explorer keeps the height of the longest. */
.panel {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  visibility: hidden;
}

.panel.active {
  visibility: visible;
  animation: appear 0.18s ease-out;
}

@keyframes appear {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel.active {
    animation: none;
  }
}

/* Short files leave blank space under the code, as an editor would. */
.code {
  flex: 1;
  padding: 8px 0;
}

.code :deep(div[class*="language-"]) {
  margin: 0;
  border-radius: 0;
}

.code :deep(.lang) {
  display: none;
}

.code :deep(.vp-code span) {
  color: var(--shiki-dark, inherit);
}

.code :deep(pre) {
  padding-top: 12px;
  padding-bottom: 12px;
}

.code :deep(code) {
  font-size: 13px;
}

/* Discord's own dark theme, so the result reads as Discord. */
.discord {
  padding: 20px 24px 24px;
  background: #313338;
  color: #dbdee1;
  font-size: 15px;
  line-height: 1.4;
}

.discord p {
  margin: 0;
}

.message {
  display: flex;
  gap: 14px;
}

.avatar {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #1b140e;
  padding: 5px;
}

.author {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
  color: #f2f3f5;
  font-weight: 600;
}

.app {
  padding: 1px 5px;
  border-radius: 4px;
  background: #5865f2;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}

.used,
.joined {
  margin-bottom: 10px;
  padding-left: 54px;
  color: #949ba4;
  font-size: 14px;
}

.command {
  color: #00a8fc;
}

.arrow {
  margin-right: 8px;
  margin-left: -26px;
  color: #23a55a;
}

.mention {
  padding: 0 2px;
  border-radius: 3px;
  background: rgba(88, 101, 242, 0.3);
  color: #c9cdfb;
}

.button {
  display: inline-block;
  margin-top: 8px;
  padding: 6px 16px;
  border-radius: 8px;
  background: #da373c;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.custom-id {
  margin-top: 10px;
  color: #949ba4;
  font-size: 13px;
}

.custom-id code {
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #1e1f22;
  color: var(--honey);
  font-size: 12.5px;
}

.picker {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px 8px 0 0;
  background: #2b2d31;
}

.icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1b140e;
  padding: 4px;
}

.picked {
  color: #f2f3f5;
  font-weight: 600;
}

.description {
  color: #949ba4;
  font-size: 13px;
}

.source {
  margin-left: auto;
  color: #949ba4;
  font-size: 13px;
}

.input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-radius: 0 0 8px 8px;
  background: #383a40;
}

.typed {
  color: #f2f3f5;
}

.option {
  padding: 1px 8px;
  border-radius: 4px;
  background: #4e5058;
  color: #f2f3f5;
  font-size: 14px;
}

.key {
  color: #b5bac1;
}
</style>
