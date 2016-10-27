/**
 * Helper utilities.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

// We don't want to depend on the full Node.JS typings, and only use this to
// detect the presence of Node, webworker or browser context, so declare it here.
declare var global: any;
declare var self: any;
declare var window: any;

/**
 * Throw an Error when given condition is false.
 *
 * @param {any}    condition Condition, no-op when truthy, error thrown when falsy
 * @param {string} msg       Optional text to include in error message
 */
export function assert(condition: any, msg?: string): void {
	if (!condition) {
		throw new Error(msg ? "assertion failed: " + msg : "assertion failed");
	}
}

/**
 * Return reference to the global object (if possible).
 *
 * @return {any} Reference to the global object (e.g. `window`, `global`, etc.),
 *               or `undefined` if it could not be determined.
 */
export function getGlobal(): any {
	if (typeof self !== "undefined") { // WebWorkers
		return self;
	}
	if (typeof window !== "undefined") { // Browsers
		return window;
	}
	if (typeof global !== "undefined") { // Serverside (Node)
		return global;
	}
	// Otherwise, try to use `this`.
	// We use eval-like behavior, because it will not inherit our "use strict",
	// see http://stackoverflow.com/questions/3277182/how-to-get-the-global-object-in-javascript
	let g: any;
	try {
		g = new Function("return this")();
	} catch (e) {
		// Content Security Policy might not allow the eval()-evilness above,
		// so just ignore then...
	}
	return g;
}
