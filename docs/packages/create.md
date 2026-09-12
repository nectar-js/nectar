# @nectar-js/create

Create a Nectar project with TypeScript or JavaScript.

```bash
npm create @nectar-js
```

It asks where to put the project, TypeScript or JavaScript, and which package manager to use. Then it asks for your bot's token, application ID, and test server ID, which go in `.env` and can be skipped. It can also install dependencies and create a git repository.

```
npm create @nectar-js [directory] [options]

  --ts, --js                Language. Asked when omitted.
  --pm <name>               Package manager: npm, pnpm, yarn, or bun. Detected from the one running this.
  --install, --no-install   Install dependencies. Asked when omitted.
  --git, --no-git           Create a git repository. Asked when omitted.
  --yes, -y                 Use the defaults for anything not given, and skip the Discord details.
  --help, -h                Show this help.
```

With npm, put `--` before the options: `npm create @nectar-js my-bot -- --ts`.


After creating the project, follow [Installation](../getting-started/installation#start-the-bot) to run your bot.
