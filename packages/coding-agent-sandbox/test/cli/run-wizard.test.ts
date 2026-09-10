import type { Mock } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_EFFORTS } from '../../src/agents/reasoning-effort';
import { detectDefaultRepo } from '../../src/cli/detect-default-repo';
import { runWizard } from '../../src/cli/run-wizard';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../src/cli/detect-default-repo', () => ({
  detectDefaultRepo: vi.fn(() => '/detected/repo'),
}));

// The real prompts return a cancelable promise; the mocks only need the answer.
const selectMock = select as unknown as Mock<(config: unknown) => Promise<unknown>>;
const inputMock = input as unknown as Mock<(config: unknown) => Promise<string>>;
const confirmMock = confirm as unknown as Mock<(config: unknown) => Promise<boolean>>;

/** Queues answers in the order the wizard asks for them. */
function queue(answers: {
  select: readonly unknown[];
  input: readonly string[];
  confirm?: readonly boolean[];
}): void {
  let selects = 0;
  let inputs = 0;
  let confirms = 0;
  selectMock.mockImplementation(async () => answers.select[selects++]);
  inputMock.mockImplementation(async () => answers.input[inputs++] ?? '');
  confirmMock.mockImplementation(async () => answers.confirm?.[confirms++] ?? true);
}

const directories: string[] = [];

/** Writes an `agents.jsonc` the wizard can read through `--configs-dir`. */
function configsDir(settings: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-configs-'));
  directories.push(root);
  fs.writeFileSync(path.join(root, 'agents.jsonc'), JSON.stringify(settings));
  return root;
}

/** Writes an initial-prompt file that the wizard can resolve before it asks questions. */
function promptFile(contents: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-prompt-'));
  directories.push(root);
  const file = path.join(root, 'prompt.md');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

describe('runWizard', () => {
  beforeEach(() => {
    selectMock.mockReset();
    inputMock.mockReset();
    confirmMock.mockReset();
    vi.mocked(detectDefaultRepo).mockClear();
  });

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should short-circuit on prune without asking anything else', async () => {
    queue({ select: ['prune'], input: [] });

    await expect(runWizard()).resolves.toStrictEqual({ action: 'prune' });
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(inputMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('should collect a full strict session', async () => {
    queue({
      select: ['strict', 'codex', true],
      input: ['/work/app', 'fix login'],
      confirm: [false],
    });

    await expect(runWizard()).resolves.toStrictEqual({
      action: 'session',
      options: {
        agent: 'codex',
        repo: '/work/app',
        task: 'fix login',
        fullAccess: false,
        gitMount: true,
        network: 'strict',
      },
    });
  });

  it('should not ask for a config directory when there is no network', async () => {
    queue({
      select: ['none', 'claude', false],
      input: ['/work/app', 'fix login'],
    });

    await expect(runWizard()).resolves.toStrictEqual({
      action: 'session',
      options: {
        agent: 'claude',
        repo: '/work/app',
        task: 'fix login',
        fullAccess: true,
        gitMount: false,
        network: 'none',
      },
    });
    expect(inputMock).toHaveBeenCalledTimes(2);
  });

  it('should offer the detected repository as the default', async () => {
    queue({ select: ['strict', 'claude', true], input: ['', 'fix login'] });

    await runWizard();

    expect(inputMock.mock.calls[0]?.[0]).toMatchObject({ default: '/detected/repo' });
  });

  it('should preserve supplied values and skip their matching questions', async () => {
    queue({ select: ['strict', true], input: ['fix login'], confirm: [false] });

    await expect(
      runWizard({ agent: 'codex', repo: '/work/app', configsDir: '/configs' }),
    ).resolves.toStrictEqual({
      action: 'session',
      options: {
        agent: 'codex',
        repo: '/work/app',
        task: 'fix login',
        configsDir: '/configs',
        fullAccess: false,
        gitMount: true,
        network: 'strict',
      },
    });
    expect(inputMock).toHaveBeenCalledTimes(1);
  });

  it('should preserve a supplied prompt without prompting for a prompt', async () => {
    queue({
      select: ['strict', '', true],
      input: ['', '/work/app', 'fix login'],
      confirm: [false],
    });

    await expect(
      runWizard({ agent: 'claude', prompt: 'Fix the login flow' }),
    ).resolves.toMatchObject({
      action: 'session',
      options: { prompt: 'Fix the login flow' },
    });
  });

  it('should ask for the model and effort when a prompt will start the session', async () => {
    queue({
      select: ['strict', 'high', true],
      input: ['gpt-5.1-codex-max', '/work/app', 'fix login'],
    });

    await expect(runWizard({ agent: 'codex', prompt: 'ship it' })).resolves.toMatchObject(
      {
        action: 'session',
        options: { model: 'gpt-5.1-codex-max', effort: 'high' },
      },
    );
  });

  it('should treat a prompt file as an initial prompt', async () => {
    const file = promptFile('ship it\n');
    queue({
      select: ['strict', 'high', true],
      input: ['gpt-5.1-codex-max', '/work/app', 'fix login'],
    });

    await expect(runWizard({ agent: 'codex', promptFile: file })).resolves.toMatchObject({
      options: { prompt: 'ship it', model: 'gpt-5.1-codex-max', effort: 'high' },
    });
  });

  it('should offer the configured models and their efforts as choices', async () => {
    const root = configsDir({
      codex: {
        model: 'gpt-5.1-codex-max',
        effort: 'high',
        models: [
          { name: 'gpt-5.1-codex-max', label: 'Codex Max', efforts: ['low', 'high'] },
          'gpt-5.1-codex-mini',
        ],
      },
    });
    queue({
      select: ['strict', 'gpt-5.1-codex-max', 'low', true],
      input: ['/work/app', 'fix login'],
    });

    await expect(
      runWizard({ agent: 'codex', prompt: 'ship it', configsDir: root }),
    ).resolves.toMatchObject({
      options: { model: 'gpt-5.1-codex-max', effort: 'low' },
    });
    expect(selectMock.mock.calls[1]?.[0]).toMatchObject({
      default: 'gpt-5.1-codex-max',
      choices: [
        { name: 'Codex Max', value: 'gpt-5.1-codex-max' },
        { name: 'gpt-5.1-codex-mini', value: 'gpt-5.1-codex-mini' },
        { name: 'Agent default', value: '' },
      ],
    });
    expect(selectMock.mock.calls[2]?.[0]).toMatchObject({
      default: 'high',
      choices: [
        { name: 'low', value: 'low' },
        { name: 'high', value: 'high' },
        { name: 'Agent default', value: '' },
      ],
    });
    expect(inputMock).toHaveBeenCalledTimes(2);
  });

  it('should leave both unset when the agent default is chosen', async () => {
    queue({ select: ['strict', '', true], input: ['', '/work/app', 'fix login'] });

    const result = await runWizard({ agent: 'codex', prompt: 'ship it' });

    expect(result).toStrictEqual({
      action: 'session',
      options: {
        agent: 'codex',
        prompt: 'ship it',
        repo: '/work/app',
        task: 'fix login',
        fullAccess: true,
        gitMount: true,
        network: 'strict',
      },
    });
  });

  it('should skip both questions when the command line already answered them', async () => {
    queue({ select: ['strict', true], input: ['/work/app', 'fix login'] });

    await expect(
      runWizard({
        agent: 'codex',
        prompt: 'ship it',
        model: 'gpt-5.1-codex',
        effort: 'low',
      }),
    ).resolves.toMatchObject({
      options: { model: 'gpt-5.1-codex', effort: 'low' },
    });
    expect(inputMock).toHaveBeenCalledTimes(2);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('should skip the effort question when the model carries the shorthand', async () => {
    queue({ select: ['strict', true], input: ['/work/app', 'fix login'] });

    await expect(
      runWizard({ agent: 'codex', prompt: 'ship it', model: 'gpt-5.1-codex-max:high' }),
    ).resolves.toMatchObject({
      options: { model: 'gpt-5.1-codex-max:high', effort: 'high' },
    });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('should offer the shorthand levels when agents.jsonc lists none', async () => {
    queue({ select: ['strict', 'max', true], input: ['opus', '/work/app', 'fix login'] });

    await expect(
      runWizard({ agent: 'claude', prompt: 'ship it' }),
    ).resolves.toMatchObject({ options: { model: 'opus', effort: 'max' } });
    expect(selectMock.mock.calls[1]?.[0]).toMatchObject({
      choices: [
        ...KNOWN_EFFORTS.map((level) => ({ name: level, value: level })),
        { name: 'Agent default', value: '' },
      ],
    });
  });
});
