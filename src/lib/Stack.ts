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

var hasStacks = (typeof (<any>Error).captureStackTrace === "function");

export default class Stack {
	private stack: string; // Note: name *must* be "stack", without underscore

	constructor(ignoreUntil: Function = Stack) {
		/* istanbul ignore else */ // TODO: remove when testing for non-V8
		if (hasStacks) {
			(<any>Error).captureStackTrace(this, ignoreUntil);
		} else {
			this.stack = "dummy\n<no trace>";
		}
	}

	public inspect(): string {
		var lines = this.stack.split("\n");
		lines.shift(); // Strip the "[object Object]" line
		return lines.join("\n");
	}
}
