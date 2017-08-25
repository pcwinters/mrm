// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const requireg = require('requireg');
const { get, forEach } = require('lodash');
const { MrmUnknownTask, MrmUnknownAlias, MrmUndefinedOption } = require('./errors');

/* eslint-disable no-console */

/**
 * Return all task and alias names and descriptions from all search directories.
 *
 * @param {string[]} directories
 * @param {Object} options
 * @return {Object}
 */
function getAllTasks(directories, options) {
	const allTasks = getAllAliases(options);
	for (const dir of directories) {
		const tasks = glob.sync(`${dir}/*/index.js`);
		tasks.forEach(filename => {
			const taskName = path.basename(path.dirname(filename));
			if (!allTasks[taskName]) {
				const module = require(filename);
				allTasks[taskName] = module.description || '';
			}
		});
	}
	return allTasks;
}

/**
 *
 * @param {Object} options
 * @return {Object}
 */
function getAllAliases(options) {
	return get(options, 'aliases', {});
}

/**
 *
 * @param {string|string[]} name
 * @param {string[]} directories
 * @param {Object} options
 * @param {Object} argv
 */
function run(name, directories, options, argv) {
	if (Array.isArray(name)) {
		name.forEach(n => run(n, directories, options, argv));
		return;
	}

	if (getAllAliases(options)[name]) {
		runAlias(name, directories, options, argv);
	} else {
		runTask(name, directories, options, argv);
	}
}

/**
 * Run an alias.
 *
 * @param {string} aliasName
 * @param {string[]} directories
 * @param {Object} options
 * @param {Object} [argv]
 */
function runAlias(aliasName, directories, options, argv) {
	const tasks = getAllAliases(options)[aliasName];
	if (!tasks) {
		throw new MrmUnknownAlias(`Alias “${aliasName}” not found.`);
	}

	console.log(chalk.yellow(`Running alias ${aliasName}...`));

	tasks.forEach(name => runTask(name, directories, options, argv));
}

/**
 * Run a task.
 *
 * @param {string} taskName
 * @param {string[]} directories
 * @param {Object} options
 * @param {Object} [argv]
 */
function runTask(taskName, directories, options, argv) {
	const modulePath = tryResolve(
		tryFile(directories, `${taskName}/index.js`),
		`mrm-task-${taskName}`,
		taskName
	);
	if (!modulePath) {
		throw new MrmUnknownTask(`Task “${taskName}” not found.`, { taskName });
	}

	console.log(chalk.cyan(`Running ${taskName}...`));

	const module = require(modulePath);
	module(getConfigGetter(options), argv);
}

/**
 * Return a config getter.
 *
 * @param {Object} options
 * @return {any}
 */
function getConfigGetter(options) {
	/**
	 * Return a config value.
	 *
	 * @param {string} prop
	 * @param {any} [defaultValue]
	 * @return {any}
	 */
	function config(prop, defaultValue) {
		console.warn(
			'Warning: calling config as a function is deprecated. Use config.values() instead'
		);
		return get(options, prop, defaultValue);
	}

	/**
	 * Return an object with all config values.
	 *
	 * @return {Object}
	 */
	function values() {
		return options;
	}

	/**
	 * Mark config options as required.
	 *
	 * @param {string[]} names...
	 * @return {Object} this
	 */
	function require(...names) {
		const unknown = names.filter(name => options[name] === undefined);
		if (unknown.length > 0) {
			throw new MrmUndefinedOption(`Required config options are missed: ${unknown.join(', ')}.`, {
				unknown,
			});
		}
		return config;
	}

	/**
	 * Set default values.
	 *
	 * @param {Object} defaultOptions
	 * @return {any}
	 */
	function defaults(defaultOptions) {
		options = Object.assign({}, defaultOptions, options);
		return config;
	}

	config.require = require;
	config.defaults = defaults;
	config.values = values;
	return config;
}

/**
 *
 * @param {string[]} directories
 * @param {string} filename
 * @param {Object} argv
 * @return {Object}
 */
function getConfig(directories, filename, argv) {
	return Object.assign(
		{},
		getConfigFromFile(directories, filename),
		getConfigFromCommandLine(argv)
	);
}

/**
 * Find and load config file.
 *
 * @param {string[]} directories
 * @param {string} filename
 * @return {Object}
 */
function getConfigFromFile(directories, filename) {
	const filepath = tryFile(directories, filename);
	if (!filepath) {
		return {};
	}

	return require(filepath);
}

/**
 * Get config options from command line, passed as --config:foo bar.
 *
 * @param {Object} argv
 * @return {Object}
 */
function getConfigFromCommandLine(argv) {
	const options = {};
	forEach(argv, (value, key) => {
		if (key.startsWith('config:')) {
			options[key.replace(/^config:/, '')] = value;
		}
	});
	return options;
}

/**
 * Try to load a file from a list of folders.
 *
 * @param {string[]} directories
 * @param {string} filename
 * @return {string|undefined} Absolute path or undefined
 */
function tryFile(directories, filename) {
	return firstResult(directories, dir => {
		const filepath = path.resolve(dir, filename);
		return fs.existsSync(filepath) ? filepath : undefined;
	});
}

/**
 * Try to resolve any of the given npm modules. Works with local files, local and global npm modules.
 *
 * @param {string[]} names...
 * @return {any}
 */
function tryResolve(...names) {
	return firstResult(names, requireg.resolve);
}

/**
 * Return the first truthy result of a callback.
 *
 * @param {any[]} items
 * @param {Function} fn
 * @return {any}
 */
function firstResult(items, fn) {
	for (const item of items) {
		if (!item) {
			continue;
		}

		const result = fn(item);
		if (result) {
			return result;
		}
	}
	return undefined;
}

module.exports = {
	getAllAliases,
	getAllTasks,
	run,
	runTask,
	runAlias,
	getConfigGetter,
	getConfig,
	getConfigFromFile,
	getConfigFromCommandLine,
	tryFile,
	tryResolve,
	firstResult,
};
