import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';

// Exercise the REAL installed Expo CLI modules through their own Node resolver.
// No copied schemas, framework upgrade, zod alias, SDK shim, server or network.
const mobileRequire = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expoPackagePath = mobileRequire.resolve('expo/package.json');
const expoRequire = createRequire(expoPackagePath);
const cliPackagePath = expoRequire.resolve('@expo/cli/package.json');
const server = join(dirname(cliPackagePath), 'build/src/start/server');
const cliRequire = createRequire(join(server, 'DevToolsPlugin.schema.js'));
const zod = cliRequire('zod');
const zodPackage = cliRequire('zod/package.json');
const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire('./DevToolsPlugin.schema.js');
const { createMCPDevToolsExtensionSchema } = cliRequire('./createMCPDevToolsExtensionSchema.js');
const { DevToolsPlugin } = cliRequire('./DevToolsPlugin.js');
const { DevToolsPluginCliExtensionResults } = cliRequire('./DevToolsPluginCliExtensionResults.js');
const { addMcpCapabilities } = cliRequire('./MCPDevToolsPluginCLIExtensions.js');

function plugin() {
  return { packageName: '@test/offline-devtools', packageRoot: dirname(cliPackagePath), bannerTitle: 'Offline plugin',
    cliExtensions: { description: 'Offline schema compatibility', entryPoint: 'not-executed.js', commands: [
      { name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'], parameters: [
        { name: 'query', type: 'text', description: 'Search text' }, { name: 'count', type: 'number' }, { name: 'confirm', type: 'confirm' },
      ] },
      { name: 'clear', title: 'Clear', environments: ['mcp'], parameters: [{ name: 'confirm', type: 'confirm' }] },
      { name: 'cli-only', title: 'Terminal command', environments: ['cli'] },
    ] } };
}
const output = () => [
  { type: 'text', text: 'Completed', level: 'info' },
  { type: 'image', url: 'https://example.invalid/image.png', text: 'Image' },
  { type: 'audio', url: 'https://example.invalid/audio.wav' },
];

test('Expo CLI resolves the scoped patched Zod4 without upgrading Expo/CLI', () => {
  const mobile = JSON.parse(readFileSync(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
  assert.equal(mobile.overrides['@expo/cli'].zod, '4.6.6');
  assert.equal(zodPackage.version, '4.6.6');
  assert.equal(mobile.dependencies.expo, '~57.0.26');
  assert.equal(expoRequire('./package.json').version, '57.0.26');
  assert.equal(JSON.parse(readFileSync(cliPackagePath, 'utf8')).version, '57.0.27');
  assert.equal(PluginSchema instanceof zod.ZodObject, true, 'actual Expo schema must use the patched resolved copy');
});

test('actual PluginSchema round-trips config, strips extra keys, and preserves readonly environments', () => {
  const input = { ...plugin(), unrecognizedMetadata: 'stripped' };
  const parsed = PluginSchema.parse(input);
  assert.equal(parsed.unrecognizedMetadata, undefined);
  assert.deepEqual(parsed, plugin());
  assert.deepEqual(PluginSchema.parse(JSON.parse(JSON.stringify(parsed))), parsed);
  assert.equal(Object.isFrozen(parsed.cliExtensions.commands[0].environments), true);
  assert.throws(() => parsed.cliExtensions.commands[0].environments.push('invalid'), TypeError);
  assert.deepEqual(input.cliExtensions.commands[0].environments, ['cli', 'mcp']);
  assert.equal(Object.isFrozen(input.cliExtensions.commands[0].environments), false, 'parsing must not freeze caller arrays');
  const instance = new DevToolsPlugin(parsed, parsed.packageRoot);
  assert.equal(instance.packageName, parsed.packageName); assert.equal(instance.cliBanner, true);
  assert.equal(instance.bannerTitle, 'Offline plugin'); assert.equal(instance.description, 'Offline schema compatibility');
});

for (const [label, mutate] of [
  ['empty package', value => { value.packageName = ''; }],
  ['empty command', value => { value.cliExtensions.commands[0].name = ''; }],
  ['invalid environment', value => { value.cliExtensions.commands[0].environments = ['remote']; }],
  ['invalid parameter type', value => { value.cliExtensions.commands[0].parameters[0].type = 'object'; }],
  ['no commands', value => { value.cliExtensions.commands = []; }],
]) test(`actual plugin constructor still rejects invalid configuration: ${label}`, () => {
  const value = plugin(); mutate(value);
  const result = PluginSchema.safeParse(value); assert.equal(result.success, false);
  assert.ok(result.error.issues.length > 0); assert.ok(result.error.issues.every(issue => typeof issue.message === 'string'));
  assert.throws(() => new DevToolsPlugin(value, value.packageRoot), error => error.message.startsWith('Invalid plugin configuration:')
    && error.cause instanceof zod.ZodError && error.cause.issues.length > 0);
});

test('actual output schema parses text/audio/image and the CLI output collector consumes the result', () => {
  const lines = output(), emitted = [];
  assert.deepEqual(DevToolsPluginOutputSchema.parse(lines), lines);
  const results = new DevToolsPluginCliExtensionResults(value => emitted.push(...value));
  results.append(JSON.stringify(lines)); results.append('first plain line\nsecond plain line', 'warning'); results.exit(2);
  assert.deepEqual(results.getOutput().slice(0, 3), lines);
  assert.deepEqual(results.getOutput().slice(3, 5), [
    { type: 'text', text: 'first plain line', level: 'warning' }, { type: 'text', text: 'second plain line', level: 'warning' },
  ]);
  assert.equal(results.getOutput().at(-1).text, 'Process exited with code 2');
  assert.deepEqual(results.getOutput(), emitted);
});

for (const invalid of [
  [{ type: 'image', url: 'not-a-url' }], [{ type: 'audio' }], [{ type: 'text', text: 42, level: 'info' }],
  [{ type: 'text', text: 'hello', level: 'debug' }], [{ type: 'unknown' }],
]) test(`actual output error consumer handles Zod4 issues: ${JSON.stringify(invalid)}`, () => {
  const results = new DevToolsPluginCliExtensionResults(); results.append(JSON.stringify(invalid));
  const actual = results.getOutput(); assert.equal(actual.length, 1); assert.equal(actual[0].level, 'error');
  assert.match(actual[0].text, /^Invalid JSON: .+/u); assert.ok(!actual[0].text.includes('TypeError'));
});

test('actual generated MCP schema preserves enums, optional typed parameters, strict unknown-key rejection and descriptions', () => {
  const parsed = PluginSchema.parse(plugin()), schema = createMCPDevToolsExtensionSchema(parsed);
  const args = { command: 'inspect', query: 'bottle', count: 2, confirm: true };
  assert.deepEqual(schema.parse(JSON.parse(JSON.stringify(args))), args);
  assert.deepEqual(schema.parse({ command: 'clear' }), { command: 'clear' });
  for (const invalid of [{ command: 'foreign' }, { command: 'inspect', count: '2' }, { command: 'inspect', confirm: 'true' },
    { command: 'inspect', query: 2 }, { command: 'inspect', unknown: true }, {}]) assert.equal(schema.safeParse(invalid).success, false);
  assert.match(schema.shape.command.description, /inspect/u); assert.match(schema.shape.confirm.description, /Parameter for|Used by/u);
  // Zod4's real JSON-schema bridge must be able to encode Expo's actual schema.
  const jsonSchema = zod.toJSONSchema(schema);
  assert.equal(jsonSchema.type, 'object'); assert.equal(jsonSchema.additionalProperties, false);
  assert.deepEqual(jsonSchema.properties.command.enum, ['inspect', 'clear', 'cli-only']);
  assert.deepEqual(jsonSchema.required, ['command']);
  assert.equal(jsonSchema.properties.count.type, 'number'); assert.equal(jsonSchema.properties.confirm.type, 'boolean');
});

test('actual MCP factory rejects missing/empty command definitions', () => {
  assert.throws(() => createMCPDevToolsExtensionSchema({ packageName: 'missing' }), /no commands defined/u);
  assert.throws(() => createMCPDevToolsExtensionSchema({ packageName: 'empty', cliExtensions: { commands: [] } }), /no commands defined/u);
});

test('actual MCP registration scopes commands and consumes success/error output through real schemas', async () => {
  const childProcess = cliRequire('node:child_process');
  const { Log } = cliRequire('../../log.js');
  const previousSpawn = childProcess.spawn, previousLog = Log.error;
  const registrations = [], execution = [], logged = [];
  let next = output();
  // Only the process-launch boundary is stubbed. Expo registration, executor,
  // schema creation, parse, output conversion and issues handling are REAL.
  childProcess.spawn = (executable, args) => {
    execution.push({ executable, args });
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
    queueMicrotask(() => { child.stdout.emit('data', Buffer.from(JSON.stringify(next))); child.emit('close', 0); });
    return child;
  };
  Log.error = (...args) => logged.push(args);
  try {
    const descriptor = PluginSchema.parse(plugin());
    await addMcpCapabilities({ registerTool: (name, options, callback) => registrations.push({ name, options, callback }) }, {
      devtoolsPluginManager: { queryPluginsAsync: async () => [descriptor] }, projectRoot: descriptor.packageRoot,
      getDefaultDevServer: () => ({ getJsInspectorBaseUrl: () => 'http://localhost.invalid:8081' }),
    });
    assert.equal(registrations.length, 1); const registered = registrations[0]; assert.equal(registered.name, descriptor.packageName);
    const schema = zod.z.object(registered.options.inputSchema), args = { parameters: { command: 'inspect', query: 'bottle', count: 3, confirm: false } };
    const parsed = schema.parse(args); assert.equal(schema.safeParse({ parameters: { command: 'cli-only' } }).success, false);
    assert.equal(schema.safeParse({ parameters: { command: 'inspect', extra: true } }).success, false);
    const success = await registered.callback(parsed);
    assert.deepEqual(success.content, [
      { type: 'text', text: 'Completed', level: 'info', url: undefined },
      { type: 'text', text: 'image resource: https://example.invalid/image.png (Image)' },
      { type: 'text', text: 'audio resource: https://example.invalid/audio.wav' },
    ]);
    assert.equal(execution[0].executable, process.execPath);
    assert.deepEqual(execution[0].args.slice(1), ['inspect', JSON.stringify({ query: 'bottle', count: 3, confirm: false }), 'http://localhost.invalid:8081']);
    next = [{ type: 'audio', url: 'bad-url' }];
    const invalidOutput = await registered.callback(parsed);
    assert.equal(invalidOutput.content[0].level, 'error'); assert.match(invalidOutput.content[0].text, /^Invalid JSON:/u);
    const failure = await registered.callback(schema.parse({ parameters: { command: 'inspect' } })); assert.equal(failure.isError, true);
    assert.match(failure.content[0].text, /Expected 3 parameter/u); assert.ok(!failure.content[0].text.includes('TypeError'));
    assert.equal(logged.length, 1);
  } finally { childProcess.spawn = previousSpawn; Log.error = previousLog; }
});

test('optional external MCP tunnel/SDK acceptance is explicitly outside this installed-module compatibility proof', () => {
  // Expo loads these optional modules only when its MCP environment is enabled.
  // Do not auto-install/start them or label a registration fixture a live tunnel.
  assert.throws(() => mobileRequire.resolve('expo-mcp'), { code: 'MODULE_NOT_FOUND' });
});
