/**
 * @fileoverview CodeAgent class — AI agent with multiple code-oriented tools.
 * Provides write_code, execute_code, write_and_run_code, fix_code, run_bash,
 * and (optionally) use_skill tools for autonomous coding tasks.
 *
 * Port of `ak-claude/code-agent.js`. The tool definitions are kept in the
 * Claude `input_schema` shape and converted to the OpenAI function shape by
 * `BaseLiteLLM._buildTools()`; the loop itself speaks `message.tool_calls` and
 * `{role:'tool', tool_call_id}` because that is what the gateway accepts.
 */

import { execFile } from 'node:child_process';
import { writeFile, unlink, readdir, readFile, mkdir } from 'node:fs/promises';
import { join, sep, basename, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

import BaseLiteLLM from './base.js';
import { normalizeOptions } from './compat.js';
import log from './logger.js';

/**
 * @typedef {import('./types').CodeAgentOptions} CodeAgentOptions
 * @typedef {import('./types').CodeAgentResponse} CodeAgentResponse
 * @typedef {import('./types').CodeAgentStreamEvent} CodeAgentStreamEvent
 */

const MAX_OUTPUT_CHARS = 50_000;
const MAX_FILE_TREE_LINES = 500;
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', 'build', '__pycache__', '.venv']);

const LANG_CONFIG = {
	javascript: {
		toolDescExecute: 'Execute a given piece of JavaScript code in a Node.js child process. Use this when you already have code to run — e.g., running code from a previous write_code call, re-running a snippet, or executing code the user provided. Use console.log() for output.',
		toolDescWriteAndRun: 'Write a fresh solution from scratch and execute it in one step. Use this when you need to figure out the code AND run it — the autonomous, end-to-end tool for solving problems with code.',
		codeParamDesc: 'JavaScript code to execute. Use console.log() for output. Use import syntax (ES modules).',
		codeRules: `- Your code runs in a Node.js child process with access to all built-in modules
- IMPORTANT: Your code runs as an ES module (.mjs). Use import syntax, NOT require():
  - import fs from 'fs';
  - import path from 'path';
  - import { execSync } from 'child_process';
- Use console.log() to produce output — that's how results are returned to you
- Write efficient scripts that do multiple things per execution when possible
- For parallel async operations, use Promise.all()
- Handle errors in your scripts with try/catch so you get useful error messages
- Top-level await is supported`,
		commentsEnabled: `- Add a JSDoc @fileoverview comment at the top of each script explaining what it does\n- Add brief JSDoc @param comments for any functions you define`,
		commentsDisabled: `- Do NOT write any comments in your code — save tokens. The code should be self-explanatory.`,
		packageLabel: 'Available Packages',
		packageIntro: 'These npm packages are installed and can be imported',
		bashExamples: 'ls, grep, curl, git, npm, cat',
		codeBlockLang: 'javascript',
		execToolSummary: 'Run a given piece of JavaScript code. Use when you already have code to run — e.g., from a previous write_code call, re-running a snippet, or executing user-provided code.',
		writeRunToolSummary: 'Write a fresh solution from scratch and execute it in one step. The autonomous, end-to-end tool for solving problems with code.',
	},
	python: {
		toolDescExecute: 'Execute a given piece of Python code in a child process. Use this when you already have code to run — e.g., running code from a previous write_code call, re-running a snippet, or executing code the user provided. Use print() for output.',
		toolDescWriteAndRun: 'Write a fresh Python solution from scratch and execute it in one step. Use this when you need to figure out the code AND run it — the autonomous, end-to-end tool for solving problems with code.',
		codeParamDesc: 'Python code to execute. Use print() for output.',
		codeRules: `- Your code runs in a Python 3 child process
- Use print() to produce output — that's how results are returned to you
- Use standard Python imports (import os, import json, from pathlib import Path, etc.)
- Write efficient scripts; prefer list comprehensions and built-in functions
- For async operations, use asyncio
- Handle errors with try/except so you get useful error messages
- A virtual environment is active — you can install packages using run_bash with: pip install <package>
- Installed packages persist across executions in this session`,
		commentsEnabled: `- Add a module-level docstring at the top of each script explaining what it does\n- Add brief docstrings for any functions you define`,
		commentsDisabled: `- Do NOT write any comments in your code — save tokens. The code should be self-explanatory.`,
		packageLabel: 'Available Packages',
		packageIntro: 'These Python packages are available for import',
		bashExamples: 'ls, grep, curl, git, pip, cat',
		codeBlockLang: 'python',
		execToolSummary: 'Run a given piece of Python code. Use when you already have code to run — e.g., from a previous write_code call, re-running a snippet, or executing user-provided code.',
		writeRunToolSummary: 'Write a fresh Python solution from scratch and execute it in one step. The autonomous, end-to-end tool for solving problems with code.',
	}
};

/** Tools that execute code/commands and can fail */
const EXECUTING_TOOLS = new Set(['execute_code', 'write_and_run_code', 'run_bash']);

/**
 * Parses a tool call's `arguments` JSON string into an object.
 * @param {any} toolCall
 * @returns {any}
 */
function parseToolArgs(toolCall) {
	const raw = toolCall?.function?.arguments;
	if (raw === undefined || raw === null || raw === '') return {};
	if (typeof raw === 'object') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		log.warn(`CodeAgent: tool "${toolCall?.function?.name}" returned unparseable arguments.`);
		return {};
	}
}

class CodeAgent extends BaseLiteLLM {
	/**
	 * @param {CodeAgentOptions} [options={}]
	 */
	constructor(options = {}) {
		const o = normalizeOptions(options, 'CodeAgent');
		if (o.systemPrompt === undefined) o.systemPrompt = '';

		// On CodeAgent, `timeout` is the CHILD-PROCESS timeout (30s by default),
		// not the HTTP timeout — that is what it means in ak-claude and ak-gemini.
		// Handing 30s to the gateway client would cut off long agent turns, so the
		// client keeps its own default unless `requestTimeout` says otherwise.
		super({ ...o, timeout: o.requestTimeout });

		// ── Agent config ──
		this.workingDirectory = o.workingDirectory || process.cwd();
		this.language = o.language || 'javascript';
		this.pythonPath = o.pythonPath || null;
		this.maxRounds = o.maxRounds || 10;
		this.timeout = o.timeout || 30_000;
		this.onBeforeExecution = o.onBeforeExecution || null;
		this.onCodeExecution = o.onCodeExecution || null;
		this.importantFiles = o.importantFiles || [];
		this.writeDir = o.writeDir || join(this.workingDirectory, 'tmp');
		this.keepArtifacts = o.keepArtifacts ?? false;
		this.comments = o.comments ?? false;
		this.codeMaxRetries = o.maxRetries ?? 3;
		this.skills = o.skills || [];
		this.envOverview = o.envOverview || '';

		// ── Python state (resolved during init) ──
		this._pythonBinary = null;
		this._venvPath = null;
		this._venvEnv = null;

		// ── Custom tools ──
		this.customTools = (o.tools || []).map(t => ({
			name: t.name,
			description: t.description,
			input_schema: t.input_schema || t.inputSchema || t.parametersJsonSchema || t.function?.parameters || t.parameters
		}));
		this.toolExecutor = o.toolExecutor || null;
		if (this.customTools.length > 0 && !this.toolExecutor) {
			throw new Error('CodeAgent: tools provided without a toolExecutor.');
		}

		// ── Internal state ──
		this._codebaseContext = null;
		this._contextGathered = false;
		this._stopped = false;
		this._activeProcess = null;
		this._userSystemPrompt = o.systemPrompt || '';
		this._allExecutions = [];
		this._skillRegistry = new Map();

		// ── Tools (built after skill loading; placeholder until init) ──
		this._tools = this._buildToolDefinitions();

		log.debug(`CodeAgent created for directory: ${this.workingDirectory}`);
	}

	// ── Tool Definitions ─────────────────────────────────────────────────────

	/**
	 * Build tool definitions. Kept in the Claude `input_schema` shape;
	 * `_buildTools()` converts them for the wire.
	 * use_skill is only included when skills are registered.
	 * @private
	 * @returns {Array<{name: string, description: string, input_schema: Object}>}
	 */
	_buildToolDefinitions() {
		const lang = LANG_CONFIG[this.language] || LANG_CONFIG.javascript;

		/** @type {Array<{name: string, description: string, input_schema: Object}>} */
		const tools = [
			{
				name: 'write_code',
				description: 'Output code without executing it. Use this when you want to show, propose, or present code to the user without running it.',
				input_schema: {
					type: 'object',
					properties: {
						code: { type: 'string', description: 'The code to output.' },
						purpose: { type: 'string', description: 'A short 2-4 word slug describing the code (e.g., "api-client", "data-parser").' },
						language: { type: 'string', description: 'Programming language of the code (default: "javascript").' }
					},
					required: ['code']
				}
			},
			{
				name: 'execute_code',
				description: lang.toolDescExecute,
				input_schema: {
					type: 'object',
					properties: {
						code: { type: 'string', description: lang.codeParamDesc },
						purpose: { type: 'string', description: 'A short 2-4 word slug describing what this script does (e.g., "read-config", "parse-logs").' }
					},
					required: ['code']
				}
			},
			{
				name: 'write_and_run_code',
				description: lang.toolDescWriteAndRun,
				input_schema: {
					type: 'object',
					properties: {
						code: { type: 'string', description: lang.codeParamDesc },
						purpose: { type: 'string', description: 'A short 2-4 word slug describing what this script does (e.g., "fetch-api-data", "generate-report").' }
					},
					required: ['code']
				}
			},
			{
				name: 'fix_code',
				description: 'Fix broken code. Provide the original and fixed versions with an explanation. Optionally execute the fix to verify it works.',
				input_schema: {
					type: 'object',
					properties: {
						original_code: { type: 'string', description: 'The original broken code.' },
						fixed_code: { type: 'string', description: 'The corrected code.' },
						explanation: { type: 'string', description: 'Brief explanation of what was wrong and how it was fixed.' },
						execute: { type: 'boolean', description: 'If true, execute the fixed code to verify it works (default: false).' }
					},
					required: ['original_code', 'fixed_code']
				}
			},
			{
				name: 'run_bash',
				description: `Execute a shell command in the working directory. Use this for file operations, git commands, installing packages, or any shell task (e.g., ${lang.bashExamples}). Prefer this over execute_code for simple shell operations.`,
				input_schema: {
					type: 'object',
					properties: {
						command: { type: 'string', description: 'The shell command to execute.' },
						purpose: { type: 'string', description: 'A short 2-4 word slug describing the command (e.g., "list-files", "install-deps").' }
					},
					required: ['command']
				}
			}
		];

		// Conditionally add use_skill
		if (this._skillRegistry && this._skillRegistry.size > 0) {
			tools.push({
				name: 'use_skill',
				description: `Load a skill by name to get instructions, templates, or patterns. Available skills: ${[...this._skillRegistry.keys()].join(', ')}`,
				input_schema: {
					type: 'object',
					properties: {
						skill_name: { type: 'string', description: 'The name of the skill to load.' }
					},
					required: ['skill_name']
				}
			});
		}

		// Append custom tools
		for (const t of this.customTools) {
			tools.push({ name: t.name, description: t.description, input_schema: t.input_schema });
		}

		return tools;
	}

	// ── Init ─────────────────────────────────────────────────────────────────

	/**
	 * Initialize the agent: load skills, gather codebase context, and build the
	 * system prompt.
	 * @param {boolean} [force=false]
	 */
	async init(force = false) {
		if (this._initialized && !force) return;

		await this._ensureClient();

		if (this.skills.length > 0 && (this._skillRegistry.size === 0 || force)) {
			await this._loadSkills();
		}

		if (this.language === 'python' && (!this._pythonBinary || force)) {
			await this._resolvePython();
			await this._setupVenv();
		}

		// Rebuild tools (use_skill may now be included)
		this._tools = this._buildToolDefinitions();

		if (!this._contextGathered || force) {
			await this._gatherCodebaseContext();
		}

		this.systemPrompt = this._buildSystemPrompt();

		await super.init(force);
	}

	// ── Skill Loading ────────────────────────────────────────────────────────

	/**
	 * Load skill files into the skill registry.
	 * @private
	 */
	async _loadSkills() {
		this._skillRegistry.clear();

		for (const filePath of this.skills) {
			try {
				const content = await readFile(filePath, 'utf-8');
				// Extract name from YAML frontmatter if present
				let name = basename(filePath).replace(/\.md$/i, '');
				const fmMatch = content.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$/m);
				if (fmMatch) name = fmMatch[1].trim();
				this._skillRegistry.set(name, { name, content, path: filePath });
				log.debug(`Loaded skill: ${name} from ${filePath}`);
			} catch (e) {
				log.warn(`skills: could not load "${filePath}": ${e.message}`);
			}
		}
	}

	// ── Python Resolution ───────────────────────────────────────────────────

	/**
	 * Resolve the Python 3 binary path.
	 * @private
	 */
	async _resolvePython() {
		/** @param {string} bin */
		const tryBinary = (bin) => new Promise((resolve) => {
			execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
				if (err) return resolve(null);
				const output = (stdout || '') + (stderr || '');
				if (output.includes('Python 3.')) return resolve(bin);
				resolve(null);
			});
		});

		if (this.pythonPath) {
			const result = await tryBinary(this.pythonPath);
			if (result) { this._pythonBinary = result; return; }
			throw new Error(`CodeAgent: pythonPath "${this.pythonPath}" is not a valid Python 3 binary.`);
		}

		const python3 = await tryBinary('python3');
		if (python3) { this._pythonBinary = python3; return; }

		const python = await tryBinary('python');
		if (python) { this._pythonBinary = python; return; }

		throw new Error('CodeAgent: language is "python" but python3 was not found on PATH. Install Python 3 or provide the pythonPath option.');
	}

	/**
	 * Create a virtual environment for Python execution.
	 * @private
	 */
	async _setupVenv() {
		await mkdir(this.writeDir, { recursive: true });
		this._venvPath = join(this.writeDir, '.venv');
		const isWin = process.platform === 'win32';
		const venvBin = isWin ? join(this._venvPath, 'Scripts') : join(this._venvPath, 'bin');
		const venvPython = join(venvBin, isWin ? 'python.exe' : 'python');

		try {
			await readFile(venvPython);
		} catch {
			log.debug(`Creating Python venv at ${this._venvPath}`);
			await new Promise((resolve, reject) => {
				execFile(this._pythonBinary, ['-m', 'venv', this._venvPath], {
					timeout: 30_000
				}, (err) => {
					if (err) return reject(new Error(`CodeAgent: failed to create venv: ${err.message}`));
					resolve(undefined);
				});
			});
		}

		const env = Object.assign({}, process.env);
		env.VIRTUAL_ENV = this._venvPath;
		env.PATH = venvBin + (isWin ? ';' : ':') + (process.env.PATH || '');
		this._venvEnv = env;
		this._pythonBinary = venvPython;

		log.debug(`Python venv ready at ${this._venvPath}`);
	}

	// ── Context Gathering ────────────────────────────────────────────────────

	/**
	 * @private
	 */
	async _gatherCodebaseContext() {
		let fileTree = '';

		try {
			fileTree = await this._getFileTreeGit();
		} catch {
			log.debug('git ls-files failed, falling back to readdir');
			fileTree = await this._getFileTreeReaddir(this.workingDirectory, 0, 3);
		}

		const lines = fileTree.split('\n');
		if (lines.length > MAX_FILE_TREE_LINES) {
			const truncated = lines.slice(0, MAX_FILE_TREE_LINES).join('\n');
			fileTree = `${truncated}\n... (${lines.length - MAX_FILE_TREE_LINES} more files)`;
		}

		let packages = [];
		if (this.language === 'python') {
			try {
				const reqPath = join(this.workingDirectory, 'requirements.txt');
				const content = await readFile(reqPath, 'utf-8');
				packages = content.split('\n')
					.map(l => l.trim())
					.filter(l => l && !l.startsWith('#') && !l.startsWith('-'))
					.map(l => l.split(/[>=<!\[;\s]/)[0]);
			} catch { /* no requirements.txt */ }
			if (packages.length === 0) {
				try {
					const ppPath = join(this.workingDirectory, 'pyproject.toml');
					const content = await readFile(ppPath, 'utf-8');
					const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
					if (depMatch) {
						packages = (depMatch[1].match(/"([^"]+)"/g) || [])
							.map(s => s.replace(/"/g, '').split(/[>=<!\[;\s]/)[0]);
					}
				} catch { /* no pyproject.toml */ }
			}
		} else {
			try {
				const pkgPath = join(this.workingDirectory, 'package.json');
				const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
				packages = [
					...Object.keys(pkg.dependencies || {}),
					...Object.keys(pkg.devDependencies || {})
				];
			} catch { /* no package.json */ }
		}

		const importantFileContents = [];
		if (this.importantFiles.length > 0) {
			const fileTreeLines = fileTree.split('\n').map(l => l.trim()).filter(Boolean);
			for (const requested of this.importantFiles) {
				const resolved = this._resolveImportantFile(requested, fileTreeLines);
				if (!resolved) {
					log.warn(`importantFiles: could not locate "${requested}"`);
					continue;
				}
				try {
					const fullPath = isAbsolute(resolved) ? resolved : join(this.workingDirectory, resolved);
					const content = await readFile(fullPath, 'utf-8');
					importantFileContents.push({ path: resolved, content });
				} catch (e) {
					log.warn(`importantFiles: could not read "${resolved}": ${e.message}`);
				}
			}
		}

		this._codebaseContext = { fileTree, npmPackages: packages, packages, importantFileContents };
		this._contextGathered = true;
	}

	/**
	 * @private
	 * @param {string} filename
	 * @param {string[]} fileTreeLines
	 */
	_resolveImportantFile(filename, fileTreeLines) {
		if (isAbsolute(filename)) return filename;

		const exact = fileTreeLines.find(line => line === filename);
		if (exact) return exact;

		const partial = fileTreeLines.find(line =>
			line.endsWith('/' + filename) || line.endsWith(sep + filename)
		);
		return partial || null;
	}

	/**
	 * @private
	 * @returns {Promise<string>}
	 */
	async _getFileTreeGit() {
		return new Promise((resolve, reject) => {
			execFile('git', ['ls-files'], {
				cwd: this.workingDirectory,
				timeout: 5000,
				maxBuffer: 5 * 1024 * 1024
			}, (err, stdout) => {
				if (err) return reject(err);
				resolve(stdout.trim());
			});
		});
	}

	/**
	 * @private
	 * @param {string} dir
	 * @param {number} depth
	 * @param {number} maxDepth
	 * @returns {Promise<string>}
	 */
	async _getFileTreeReaddir(dir, depth, maxDepth) {
		if (depth >= maxDepth) return '';
		const entries = [];
		try {
			const items = await readdir(dir, { withFileTypes: true });
			for (const item of items) {
				if (IGNORE_DIRS.has(item.name)) continue;
				if (item.name.startsWith('.') && depth === 0 && item.isDirectory()) continue;

				const relativePath = join(dir, item.name).replace(this.workingDirectory + '/', '');
				if (item.isFile()) {
					entries.push(relativePath);
				} else if (item.isDirectory()) {
					entries.push(relativePath + '/');
					const subEntries = await this._getFileTreeReaddir(join(dir, item.name), depth + 1, maxDepth);
					if (subEntries) entries.push(subEntries);
				}
			}
		} catch {
			// Permission errors, etc.
		}
		return entries.join('\n');
	}

	/**
	 * @private
	 */
	_buildSystemPrompt() {
		const { fileTree, packages, importantFileContents } = this._codebaseContext || { fileTree: '', packages: [], importantFileContents: [] };
		const lang = LANG_CONFIG[this.language] || LANG_CONFIG.javascript;

		let prompt = `You are a coding agent working in ${this.workingDirectory}.

## Available Tools

### write_code
Output code without executing it. Use when showing, proposing, or presenting code to the user.

### execute_code
${lang.execToolSummary}

### write_and_run_code
${lang.writeRunToolSummary}

### fix_code
Fix broken code by providing original and fixed versions. Set execute=true to verify the fix works.

### run_bash
Run shell commands directly (e.g., ${lang.bashExamples}). Prefer this over execute_code for simple shell operations.`;

		if (this._skillRegistry.size > 0) {
			prompt += `

### use_skill
Load a skill by name to get detailed instructions and templates. Available skills: ${[...this._skillRegistry.keys()].join(', ')}`;
		}

		prompt += `

## Code Execution Rules
These rules apply when using execute_code, write_and_run_code, or fix_code (with execute=true):
- Always provide a short descriptive \`purpose\` parameter (2-4 word slug like "read-config")
${lang.codeRules}
- The working directory is: ${this.workingDirectory}`;

		if (this.comments) {
			prompt += `\n${lang.commentsEnabled}`;
		} else {
			prompt += `\n${lang.commentsDisabled}`;
		}

		if (fileTree) {
			prompt += `\n\n## File Tree\n\`\`\`\n${fileTree}\n\`\`\``;
		}

		if (packages && packages.length > 0) {
			prompt += `\n\n## ${lang.packageLabel}\n${lang.packageIntro}: ${packages.join(', ')}`;
		}

		if (importantFileContents && importantFileContents.length > 0) {
			prompt += `\n\n## Key Files`;
			for (const { path: filePath, content } of importantFileContents) {
				prompt += `\n\n### ${filePath}\n\`\`\`${lang.codeBlockLang}\n${content}\n\`\`\``;
			}
		}

		if (this._userSystemPrompt) {
			prompt += `\n\n## Additional Instructions\n${this._userSystemPrompt}`;
		}

		if (this.envOverview) {
			prompt += `\n\n## Environment Overview\n${this.envOverview}`;
		}

		return prompt;
	}

	// ── Code Execution ───────────────────────────────────────────────────────

	/**
	 * @private
	 * @param {string} [purpose]
	 */
	_slugify(purpose) {
		if (!purpose) return randomUUID().slice(0, 8);
		return purpose.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
	}

	/**
	 * @private
	 * @param {string} code
	 * @param {string} [purpose]
	 * @param {string} [toolName]
	 * @returns {Promise<any>}
	 */
	async _executeCode(code, purpose, toolName) {
		if (this._stopped) {
			return { stdout: '', stderr: 'Agent was stopped', exitCode: -1 };
		}

		if (this.onBeforeExecution) {
			try {
				const allowed = await this.onBeforeExecution(code, toolName || 'execute_code');
				if (allowed === false) {
					return { stdout: '', stderr: 'Execution denied by onBeforeExecution callback', exitCode: -1, denied: true };
				}
			} catch (e) {
				log.warn(`onBeforeExecution callback error: ${e.message}`);
			}
		}

		await mkdir(this.writeDir, { recursive: true });

		const slug = this._slugify(purpose);
		const ext = this.language === 'python' ? '.py' : '.mjs';
		const tempFile = join(this.writeDir, `agent-${slug}-${Date.now()}${ext}`);

		try {
			await writeFile(tempFile, code, 'utf-8');

			const binary = this.language === 'python' ? this._pythonBinary : 'node';
			const execEnv = this.language === 'python' && this._venvEnv ? this._venvEnv : process.env;

			/** @type {any} */
			const result = await new Promise((resolve) => {
				const child = execFile(binary, [tempFile], {
					cwd: this.workingDirectory,
					timeout: this.timeout,
					env: execEnv,
					maxBuffer: 10 * 1024 * 1024
				}, (err, stdout, stderr) => {
					this._activeProcess = null;
					if (err) {
						resolve({
							stdout: /** @type {any} */ (err).stdout || stdout || '',
							stderr: (/** @type {any} */ (err).stderr || stderr || '') + (/** @type {any} */ (err).killed ? '\n[EXECUTION TIMED OUT]' : ''),
							exitCode: /** @type {any} */ (err).code || 1
						});
					} else {
						resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 });
					}
				});
				this._activeProcess = child;
			});

			const totalLen = result.stdout.length + result.stderr.length;
			if (totalLen > MAX_OUTPUT_CHARS) {
				const half = Math.floor(MAX_OUTPUT_CHARS / 2);
				if (result.stdout.length > half) {
					result.stdout = result.stdout.slice(0, half) + '\n...[OUTPUT TRUNCATED]';
				}
				if (result.stderr.length > half) {
					result.stderr = result.stderr.slice(0, half) + '\n...[STDERR TRUNCATED]';
				}
			}

			this._allExecutions.push({
				code, purpose: purpose || null, output: result.stdout, stderr: result.stderr,
				exitCode: result.exitCode, filePath: this.keepArtifacts ? tempFile : null,
				tool: toolName || 'execute_code'
			});

			if (this.onCodeExecution) {
				try { this.onCodeExecution(code, result); }
				catch (e) { log.warn(`onCodeExecution callback error: ${e.message}`); }
			}

			return result;
		} finally {
			if (!this.keepArtifacts) {
				try { await unlink(tempFile); }
				catch { /* file may already be gone */ }
			}
		}
	}

	// ── Bash Execution ───────────────────────────────────────────────────────

	/**
	 * Execute a bash command in the working directory.
	 * @private
	 * @param {string} command
	 * @param {string} [purpose]
	 * @returns {Promise<any>}
	 */
	async _executeBash(command, purpose) {
		if (this._stopped) {
			return { stdout: '', stderr: 'Agent was stopped', exitCode: -1 };
		}

		if (this.onBeforeExecution) {
			try {
				const allowed = await this.onBeforeExecution(command, 'run_bash');
				if (allowed === false) {
					return { stdout: '', stderr: 'Execution denied by onBeforeExecution callback', exitCode: -1, denied: true };
				}
			} catch (e) {
				log.warn(`onBeforeExecution callback error: ${e.message}`);
			}
		}

		const execEnv = this.language === 'python' && this._venvEnv ? this._venvEnv : process.env;

		/** @type {any} */
		const result = await new Promise((resolve) => {
			const child = execFile('bash', ['-c', command], {
				cwd: this.workingDirectory,
				timeout: this.timeout,
				env: execEnv,
				maxBuffer: 10 * 1024 * 1024
			}, (err, stdout, stderr) => {
				this._activeProcess = null;
				if (err) {
					resolve({
						stdout: /** @type {any} */ (err).stdout || stdout || '',
						stderr: (/** @type {any} */ (err).stderr || stderr || '') + (/** @type {any} */ (err).killed ? '\n[EXECUTION TIMED OUT]' : ''),
						exitCode: /** @type {any} */ (err).code || 1
					});
				} else {
					resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 });
				}
			});
			this._activeProcess = child;
		});

		const totalLen = result.stdout.length + result.stderr.length;
		if (totalLen > MAX_OUTPUT_CHARS) {
			const half = Math.floor(MAX_OUTPUT_CHARS / 2);
			if (result.stdout.length > half) {
				result.stdout = result.stdout.slice(0, half) + '\n...[OUTPUT TRUNCATED]';
			}
			if (result.stderr.length > half) {
				result.stderr = result.stderr.slice(0, half) + '\n...[STDERR TRUNCATED]';
			}
		}

		this._allExecutions.push({
			code: command, purpose: purpose || null, output: result.stdout, stderr: result.stderr,
			exitCode: result.exitCode, filePath: null, tool: 'run_bash'
		});

		if (this.onCodeExecution) {
			try { this.onCodeExecution(command, result); }
			catch (e) { log.warn(`onCodeExecution callback error: ${e.message}`); }
		}

		return result;
	}

	/**
	 * @private
	 * @param {any} result
	 */
	_formatOutput(result) {
		let output = '';
		if (result.stdout) output += result.stdout;
		if (result.stderr) output += (output ? '\n' : '') + `[STDERR]: ${result.stderr}`;
		if (result.exitCode !== 0) output += (output ? '\n' : '') + `[EXIT CODE]: ${result.exitCode}`;
		return output || '(no output)';
	}

	// ── Tool Call Dispatch ───────────────────────────────────────────────────

	/**
	 * Handle a tool call by name, dispatching to the appropriate handler.
	 * @private
	 * @param {string} name Tool name
	 * @param {any} input Tool arguments
	 * @returns {Promise<{output: string, type: string, data: any}>}
	 */
	async _handleToolCall(name, input) {
		switch (name) {
			case 'execute_code':
			case 'write_and_run_code': {
				const result = await this._executeCode(input.code || '', input.purpose, name);
				return {
					output: this._formatOutput(result),
					type: 'code_execution',
					data: {
						tool: name, code: input.code || '', purpose: input.purpose,
						stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode,
						denied: result.denied
					}
				};
			}
			case 'write_code': {
				return {
					output: 'Code written successfully.',
					type: 'write',
					data: {
						tool: 'write_code', code: input.code || '',
						purpose: input.purpose, language: input.language || 'javascript'
					}
				};
			}
			case 'fix_code': {
				let execResult = null;
				if (input.execute) {
					execResult = await this._executeCode(input.fixed_code || '', 'fix', 'fix_code');
				}
				return {
					output: input.execute ? this._formatOutput(execResult) : 'Fix recorded.',
					type: 'fix',
					data: {
						tool: 'fix_code',
						originalCode: input.original_code || '',
						fixedCode: input.fixed_code || '',
						explanation: input.explanation,
						executed: !!input.execute,
						stdout: execResult?.stdout, stderr: execResult?.stderr,
						exitCode: execResult?.exitCode, denied: execResult?.denied
					}
				};
			}
			case 'run_bash': {
				const result = await this._executeBash(input.command || '', input.purpose);
				return {
					output: this._formatOutput(result),
					type: 'bash',
					data: {
						tool: 'run_bash', command: input.command || '', purpose: input.purpose,
						stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode,
						denied: result.denied
					}
				};
			}
			case 'use_skill': {
				const skillName = input.skill_name || '';
				const skill = this._skillRegistry.get(skillName);
				if (!skill) {
					const available = [...this._skillRegistry.keys()].join(', ');
					return {
						output: `Skill "${skillName}" not found. Available skills: ${available || '(none)'}`,
						type: 'skill',
						data: { tool: 'use_skill', skillName, found: false }
					};
				}
				return {
					output: skill.content,
					type: 'skill',
					data: { tool: 'use_skill', skillName: skill.name, content: skill.content, found: true }
				};
			}
			default: {
				if (this.toolExecutor) {
					try {
						const result = await this.toolExecutor(name, input);
						const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
						return {
							output: resultStr,
							type: 'tool',
							data: { tool: name, args: input, result }
						};
					} catch (err) {
						return {
							output: `Tool "${name}" failed: ${err.message}`,
							type: 'tool',
							data: { tool: name, args: input, error: err.message }
						};
					}
				}
				return {
					output: `Unknown tool: ${name}`,
					type: 'unknown',
					data: { tool: name }
				};
			}
		}
	}

	/**
	 * Backward-compatible `codeExecutions` view of the toolCalls list.
	 * @private
	 * @param {any[]} toolCalls
	 */
	_codeExecutionsFrom(toolCalls) {
		return toolCalls
			.filter(tc => tc.tool === 'execute_code' || tc.tool === 'write_and_run_code' || (tc.tool === 'fix_code' && tc.executed))
			.map(tc => ({
				code: tc.code || tc.fixedCode,
				purpose: this._slugify(tc.purpose),
				output: tc.stdout || '',
				stderr: tc.stderr || '',
				exitCode: tc.exitCode ?? 0
			}));
	}

	// ── Non-Streaming Chat ───────────────────────────────────────────────────

	/**
	 * Send a message and get a complete response (non-streaming).
	 * Automatically handles the multi-tool execution loop.
	 *
	 * @param {string} message
	 * @param {Object} [opts={}] per-message options
	 * @returns {Promise<CodeAgentResponse>}
	 */
	async chat(message, opts = {}) {
		if (!this._initialized) await this.init();
		this._stopped = false;

		/** @type {any[]} */
		const toolCalls = [];
		let consecutiveFailures = 0;

		this._resetUsage();
		let response = await this._sendMessage(message, { tools: this._tools, ...opts });
		this._accumulateUsage(response, response._gatewayHeaders);

		for (let round = 0; round < this.maxRounds; round++) {
			if (this._stopped) break;

			const calls = response?.choices?.[0]?.message?.tool_calls || [];
			if (calls.length === 0) break;

			/** @type {any[]} */
			const toolResults = [];
			for (const call of calls) {
				if (this._stopped) break;

				const toolName = call.function?.name;
				const toolInput = parseToolArgs(call);

				const { output, data } = await this._handleToolCall(toolName, toolInput);

				toolCalls.push(data);

				const isExecutingTool = EXECUTING_TOOLS.has(toolName) || (toolName === 'fix_code' && toolInput.execute);
				if (isExecutingTool) {
					if (data.exitCode !== 0 && !data.denied) consecutiveFailures++;
					else consecutiveFailures = 0;
				}

				let toolOutput = output;
				if (consecutiveFailures >= this.codeMaxRetries) {
					toolOutput += `\n\n[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
				}

				toolResults.push({ role: 'tool', tool_call_id: call.id, content: toolOutput });
			}

			// The API requires one tool message per tool_call in the preceding
			// assistant turn. stop() partway through leaves the set short, and a
			// partial set is a 400 — bail before the send.
			if (this._stopped) break;

			response = await this._sendMessage(toolResults, { tools: this._tools, ...opts });
			this._accumulateUsage(response, response._gatewayHeaders);

			if (consecutiveFailures >= this.codeMaxRetries) break;
		}

		return {
			text: this._extractText(response),
			codeExecutions: this._codeExecutionsFrom(toolCalls),
			toolCalls,
			usage: this.getLastUsage()
		};
	}

	// ── Streaming ────────────────────────────────────────────────────────────

	/**
	 * Send a message and stream the response as events.
	 *
	 * Event types:
	 * - `text` — a chunk of the agent's text response
	 * - `code` — the agent is about to execute code (execute_code / write_and_run_code)
	 * - `output` — code/bash finished executing
	 * - `write` — the agent wrote code without executing (write_code)
	 * - `fix` — the agent fixed code (fix_code)
	 * - `bash` — the agent is about to run a bash command
	 * - `skill` — the agent loaded a skill
	 * - `tool` — a custom tool ran
	 * - `done` — the agent finished
	 *
	 * @param {string} message
	 * @param {Object} [opts={}]
	 * @yields {CodeAgentStreamEvent}
	 */
	async *stream(message, opts = {}) {
		if (!this._initialized) await this.init();
		this._stopped = false;

		/** @type {any[]} */
		const toolCalls = [];
		let fullText = '';
		let consecutiveFailures = 0;

		this._resetUsage();
		let stream = await this._streamMessage(message, { tools: this._tools, ...opts });

		for (let round = 0; round < this.maxRounds; round++) {
			if (this._stopped) break;

			/** @type {any[]} */
			const chunks = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
				const delta = chunk?.choices?.[0]?.delta?.content;
				if (typeof delta === 'string' && delta.length) {
					fullText += delta;
					yield { type: 'text', text: delta };
				}
			}

			const assembled = this._assembleStreamResponse(chunks, this.modelName);
			this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
			this._streamUsage(assembled);

			const calls = assembled.choices[0].message.tool_calls || [];
			if (calls.length === 0) {
				yield {
					type: 'done', fullText,
					codeExecutions: this._codeExecutionsFrom(toolCalls),
					toolCalls, usage: this.getLastUsage()
				};
				return;
			}

			/** @type {any[]} */
			const toolResults = [];
			for (const call of calls) {
				if (this._stopped) break;

				const toolName = call.function?.name;
				const toolInput = parseToolArgs(call);

				// Pre-execution events
				if (toolName === 'write_code') {
					yield { type: 'write', code: toolInput.code, purpose: toolInput.purpose, language: toolInput.language || 'javascript' };
				} else if (toolName === 'fix_code') {
					yield { type: 'fix', originalCode: toolInput.original_code, fixedCode: toolInput.fixed_code, explanation: toolInput.explanation };
				} else if (toolName === 'run_bash') {
					yield { type: 'bash', command: toolInput.command };
				} else if (toolName === 'execute_code' || toolName === 'write_and_run_code') {
					yield { type: 'code', code: toolInput.code };
				}

				const { output, type, data } = await this._handleToolCall(toolName, toolInput);

				toolCalls.push(data);

				if (data.stdout !== undefined || data.stderr !== undefined) {
					yield {
						type: 'output',
						code: data.code || data.command || data.fixedCode,
						stdout: data.stdout || '',
						stderr: data.stderr || '',
						exitCode: data.exitCode ?? 0
					};
				}

				if (toolName === 'use_skill') {
					yield { type: 'skill', skillName: data.skillName, content: data.content, found: data.found };
				}

				if (type === 'tool') {
					yield { type: 'tool', toolName, args: data.args, result: data.result, error: data.error };
				}

				const isExecutingTool = EXECUTING_TOOLS.has(toolName) || (toolName === 'fix_code' && toolInput.execute);
				if (isExecutingTool) {
					if (data.exitCode !== 0 && !data.denied) consecutiveFailures++;
					else consecutiveFailures = 0;
				}

				let toolOutput = output;
				if (consecutiveFailures >= this.codeMaxRetries) {
					toolOutput += `\n\n[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
				}

				toolResults.push({ role: 'tool', tool_call_id: call.id, content: toolOutput });
			}

			if (this._stopped) break;

			stream = await this._streamMessage(toolResults, { tools: this._tools, ...opts });

			if (consecutiveFailures >= this.codeMaxRetries) break;
		}

		let warning = 'Max tool rounds reached';
		if (this._stopped) warning = 'Agent was stopped';
		else if (consecutiveFailures >= this.codeMaxRetries) warning = 'Retry limit reached';

		yield {
			type: 'done', fullText,
			codeExecutions: this._codeExecutionsFrom(toolCalls),
			toolCalls, usage: this.getLastUsage(), warning
		};
	}

	// ── Dump ─────────────────────────────────────────────────────────────────

	/**
	 * Returns all code scripts and bash commands the agent has executed.
	 * @returns {Array<{fileName: string, purpose: string|null, script: string, filePath: string|null, tool: string}>}
	 */
	dump() {
		const ext = this.language === 'python' ? '.py' : '.mjs';
		return this._allExecutions.map((exec, i) => ({
			fileName: exec.purpose ? `agent-${exec.purpose}${ext}` : `script-${i + 1}${ext}`,
			purpose: exec.purpose || null,
			script: exec.code,
			filePath: exec.filePath || null,
			tool: exec.tool || 'execute_code'
		}));
	}

	// ── Stop ─────────────────────────────────────────────────────────────────

	/**
	 * Stop the agent. Kills any running child process.
	 */
	stop() {
		this._stopped = true;
		if (this._activeProcess) {
			try { this._activeProcess.kill('SIGTERM'); }
			catch { /* process may already be gone */ }
		}
		log.info('CodeAgent stopped');
	}
}

export default CodeAgent;
