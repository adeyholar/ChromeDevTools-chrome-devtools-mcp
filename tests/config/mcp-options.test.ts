/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  DEFAULT_FILESYSTEM_ROOT,
  mcpOptions,
  getMcpOptionsForViaCli,
  CLI_EXAMPLES,
  CONFLICTING_ARGS,
  IMPLICATIONS,
} from '../../src/config/mcp-options.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {createTempFile} from '../utils.js';

describe('mcp-options steps', () => {
  afterEach(() => sinon.restore());

  const parser = new ConfigParser<typeof mcpOptions>(
    '0.0.0',
    mcpOptions,
    getMcpOptionsForViaCli() as unknown as typeof mcpOptions,
    CLI_EXAMPLES,
    CONFLICTING_ARGS,
    IMPLICATIONS,
    DEFAULT_FILESYSTEM_ROOT,
  );

  describe('parseCliArgs', () => {
    it('returns only explicitly passed flags', () => {
      const args = parser.parseCliArgs(['node', 'main.js', '--headless']);
      assert.deepStrictEqual(args, {
        headless: true,
      });
    });
  });

  describe('parseConfigFile', () => {
    it('returns only the keys from the file', () => {
      using configFile = createTempFile(
        JSON.stringify({
          headless: true,
          blockedUrlPattern: ['https://a.com/*'],
        }),
        'cd4a.steps.config.json',
      );
      const args = parser.parseConfigFile(configFile.path);
      assert.strictEqual(args.headless, true);
      assert.deepStrictEqual(args.blockedUrlPattern, ['https://a.com/*']);
      assert.strictEqual(args.isolated, undefined);
      assert.strictEqual(args.channel, undefined);
    });

    it('rejects unknown keys', () => {
      using configFile = createTempFile(
        JSON.stringify({notAnOption: true}),
        'cd4a.steps.config.unknown.json',
      );
      assert.throws(
        () => parser.parseConfigFile(configFile.path),
        /Invalid JSON config file: .*notAnOption/,
      );
    });

    it('rejects non-object JSON', () => {
      using configFile = createTempFile(
        JSON.stringify([]),
        'cd4a.steps.config.array.json',
      );
      assert.throws(
        () => parser.parseConfigFile(configFile.path),
        /Invalid JSON config file: Config must be a JSON object/,
      );
    });
  });

  describe('validateConflicts', () => {
    it('accepts a single argument from a conflict group', () => {
      parser.validateConflicts({browserUrl: 'http://localhost:9222'});
    });

    it('ignores false and undefined values', () => {
      parser.validateConflicts({
        browserUrl: 'http://localhost:9222',
        wsEndpoint: undefined,
        categoryExtensions: false,
      });
    });

    it('rejects two arguments from the same group', () => {
      assert.throws(
        () =>
          parser.validateConflicts({
            browserUrl: 'http://localhost:9222',
            channel: 'canary',
          }),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    describe('validateImplications', () => {
      it('accepts when implying key is not set', () => {
        parser.validateImplications({wsEndpoint: 'ws://localhost:9222'});
      });

      it('accepts when both implying and implied keys are set', () => {
        parser.validateImplications({
          wsHeaders: {Auth: 'token'},
          wsEndpoint: 'ws://localhost:9222',
        });
      });

      it('rejects when implying key is set but implied key is missing', () => {
        assert.throws(
          () => parser.validateImplications({wsHeaders: {Auth: 'token'}}),
          /Implications failed:\n {2}wsHeaders -> wsEndpoint/,
        );
      });

      it('rejects when implying key is set but implied key is negated', () => {
        assert.throws(
          () =>
            parser.validateImplications({
              experimentalFfmpegPath: '/bin/ffmpeg',
              experimentalScreencast: false,
            }),
          /Implications failed:\n {2}experimentalFfmpegPath -> experimentalScreencast/,
        );
      });
    });
  });
  describe('applyDefaults', () => {
    it('keeps explicit values and fills in defaults', () => {
      const args = parser.applyDefaults({headless: true}, {});
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.channel, 'stable');
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    for (const explicitArgs of [
      {browserUrl: 'http://localhost:9222'},
      {wsEndpoint: 'ws://localhost:9222'},
      {executablePath: '/tmp/chrome'},
    ]) {
      it(`does not default channel with ${Object.keys(explicitArgs)[0]}`, () => {
        assert.strictEqual(
          parser.applyDefaults(explicitArgs, {}).channel,
          undefined,
        );
      });
    }

    it('applies viaCli defaults when launching a browser', () => {
      const args = parser.applyDefaults(
        {viaCli: true, filesystemRoot: DEFAULT_FILESYSTEM_ROOT},
        {},
      );
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, true);
      assert.strictEqual(args.categoryExtensions, true);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
      assert.strictEqual(args.filesystemRoot, undefined);
    });

    it('does not enable isolated or extensions for viaCli with browserUrl', () => {
      const args = parser.applyDefaults(
        {viaCli: true, browserUrl: 'http://localhost:9222'},
        {},
      );
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    it('turns off usage statistics in CI', () => {
      sinon.stub(console, 'error');
      const args = parser.applyDefaults({usageStatistics: true}, {CI: 'true'});
      assert.strictEqual(args.usageStatistics, false);
    });
  });
});
