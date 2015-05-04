/**
 * Helper class for capturing stack traces.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

// TODO:
// - test/make it work in non-V8
// - parse stacks into platform-independent object-arrays

export default class Stack {
	private stack: string; // Note: name *must* be "stack", without underscore

	constructor(ignoreUntil: Function = Stack) {
		(<any>Error).captureStackTrace(this, ignoreUntil);
	}

	inspect(): string {
		var lines = this.stack.split("\n");
		lines.shift(); // Strip the "[object Object]" line
		return lines.join("\n");
	}
}
