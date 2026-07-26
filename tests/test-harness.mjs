export function createTestPi({ flagValues = {} } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const providers = [];
  const entries = [];
  const resolvedFlagValues = new Map(Object.entries(flagValues));
  const pi = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    registerFlag(name, options) {
      if (!resolvedFlagValues.has(name) && options.default !== undefined) {
        resolvedFlagValues.set(name, options.default);
      }
    },
    getFlag(name) {
      return resolvedFlagValues.get(name);
    },
    registerProvider(name, config) {
      providers.push({ name, config });
    },
    appendEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
    },
  };
  return { pi, handlers, commands, providers, entries };
}

export function createTestContext({
  api,
  model,
  provider = "providerA",
  modelId = "gpt-5.5",
  branch = [],
  registryModels = new Map(),
  mode = "tui",
} = {}) {
  const statuses = new Map();
  const ctx = {
    model: model ?? (api ? { api, provider, id: modelId } : undefined),
    mode,
    ui: {
      setStatus(key, text) {
        if (text === undefined) statuses.delete(key);
        else statuses.set(key, text);
      },
      notify() {},
    },
    sessionManager: {
      getBranch: () => branch,
    },
    modelRegistry: {
      find: (registeredProvider, registeredModel) =>
        registryModels.get(`${registeredProvider}/${registeredModel}`),
    },
  };
  return { ctx, statuses };
}

export async function toggle(harness, ctx) {
  await harness.commands.get("fast").handler("", ctx);
}

export function inject(harness, ctx, payload) {
  const handler = harness.handlers.get("before_provider_request")?.[0];
  if (!handler) throw new Error("before_provider_request should be registered");
  return handler({ type: "before_provider_request", payload }, ctx);
}

export function fire(harness, event, ctx) {
  for (const handler of harness.handlers.get(event.type) ?? []) {
    handler(event, ctx);
  }
}
